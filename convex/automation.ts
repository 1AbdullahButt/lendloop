// Outbound notifications (Convex -> n8n) and inbound reminder bookkeeping.
// Everything here is internal: clients can't trigger deliveries or write the log.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { isIsoDate } from "./lib/dates";
import { typeFromKey, type LoanEventType } from "./lib/events";
import { sign } from "./lib/hmac";

/** 1 initial attempt + 3 retries (SPEC 6.1). */
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const MAX_ERROR_LENGTH = 300;

type PayloadBase = {
  type: LoanEventType;
  loanId: Id<"loans">;
  toolName: string;
  recipientName: string;
  recipientEmail: string;
  startDate: string;
  endDate: string;
};

type Prepared =
  | { status: "skip" }
  | { status: "broken"; error: string }
  | { status: "ready"; payload: PayloadBase };

/**
 * The party who did not act gets the message. A cancellation with `decidedAt` came from
 * the lender side (tool removal), so it goes to the borrower; a borrower's own cancel
 * goes to the lender.
 */
function recipientSide(type: LoanEventType, loan: Doc<"loans">): "lender" | "borrower" {
  if (type === "loan.requested") return "lender";
  if (type === "loan.cancelled") return loan.decidedAt === undefined ? "lender" : "borrower";
  // approved, declined, returned, and dates_taken (the blocked request's own borrower).
  return "borrower";
}

export const getEventPayload = internalQuery({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }): Promise<Prepared> => {
    const event = await ctx.db.get(eventId);
    // Already sent or given up: a stray duplicate job must not resend.
    if (!event || event.status !== "queued" || event.kind !== "request_notification") {
      return { status: "skip" };
    }
    const type = typeFromKey(event.idempotencyKey);
    const loan = await ctx.db.get(event.loanId);
    if (!type || !loan) return { status: "broken", error: "Event refers to missing data" };
    const tool = await ctx.db.get(loan.toolId);
    const side = recipientSide(type, loan);
    const recipient = await ctx.db.get(side === "lender" ? loan.lenderId : loan.borrowerId);
    if (!tool || !recipient?.email) return { status: "broken", error: "Recipient or tool missing" };
    return {
      status: "ready",
      payload: {
        type,
        loanId: loan._id,
        toolName: tool.name,
        recipientName: recipient.name,
        recipientEmail: recipient.email,
        startDate: loan.startDate,
        endDate: loan.endDate,
      },
    };
  },
});

/** Never store the secret or the webhook URL (it may carry a token) in `lastError`. */
function redact(message: string): string {
  let out = message;
  for (const sensitive of [process.env.CONVEX_TO_N8N_SECRET, process.env.N8N_REQUEST_WEBHOOK_URL]) {
    if (sensitive) out = out.split(sensitive).join("[redacted]");
  }
  return out.slice(0, MAX_ERROR_LENGTH);
}

/** POSTs one signed payload; returns null on 2xx, otherwise a short error. */
async function post(eventId: Id<"automationEvents">, base: PayloadBase): Promise<string | null> {
  const url = process.env.N8N_REQUEST_WEBHOOK_URL;
  const secret = process.env.CONVEX_TO_N8N_SECRET;
  if (!url || !secret) return "Webhook URL or signing secret is not configured";

  const body = JSON.stringify({
    eventId,
    type: base.type,
    loanId: base.loanId,
    toolName: base.toolName,
    recipientName: base.recipientName,
    recipientEmail: base.recipientEmail,
    startDate: base.startDate,
    endDate: base.endDate,
    sentAt: Date.now(),
  });
  // Signed per attempt so a retry 10 minutes later is still inside n8n's window.
  const timestamp = String(Date.now());
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LendLoop-Timestamp": timestamp,
        "X-LendLoop-Signature": await sign(secret, timestamp, body),
      },
      body,
    });
    return res.ok ? null : `HTTP ${res.status} from webhook`;
  } catch (err) {
    return redact(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const deliver = internalAction({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }): Promise<null> => {
    const prepared: Prepared = await ctx.runQuery(internal.automation.getEventPayload, { eventId });
    if (prepared.status === "skip") return null;
    const error = prepared.status === "broken" ? prepared.error : await post(eventId, prepared.payload);
    if (error === null) {
      await ctx.runMutation(internal.automation.markSent, { eventId });
    } else {
      await ctx.runMutation(internal.automation.markFailed, { eventId, error });
    }
    return null;
  },
});

export const markSent = internalMutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.status !== "queued") return null;
    await ctx.db.patch(eventId, {
      status: "sent",
      sentAt: Date.now(),
      attempts: event.attempts + 1,
      lastError: undefined,
    });
    return null;
  },
});

/** Records a failed attempt and schedules the next retry, or gives up after the last one. */
export const markFailed = internalMutation({
  args: { eventId: v.id("automationEvents"), error: v.string() },
  handler: async (ctx, { eventId, error }) => {
    const event = await ctx.db.get(eventId);
    if (!event || event.status !== "queued") return null;
    const attempts = event.attempts + 1;
    const lastError = redact(error);
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(eventId, { status: "failed", attempts, lastError });
      return null;
    }
    await ctx.db.patch(eventId, { attempts, lastError });
    await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempts - 1], internal.automation.deliver, { eventId });
    return null;
  },
});

export type OverdueItem = {
  loanId: Id<"loans">;
  toolName: string;
  borrowerName: string;
  borrowerEmail: string;
  endDate: string;
  idempotencyKey: string;
};

function reminderKey(loanId: Id<"loans">, today: string): string {
  return `${loanId}:${today}`;
}

/** Approved loans past their end date that have not had a successful reminder today. */
export const listOverdue = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }): Promise<OverdueItem[]> => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .collect();
    const items: OverdueItem[] = [];
    for (const loan of loans) {
      const idempotencyKey = reminderKey(loan._id, today);
      const reminded = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
        .filter((q) => q.eq(q.field("status"), "sent"))
        .first();
      if (reminded) continue;
      const tool = await ctx.db.get(loan.toolId);
      const borrower = await ctx.db.get(loan.borrowerId);
      if (!tool || !borrower) continue;
      items.push({
        loanId: loan._id,
        toolName: tool.name,
        borrowerName: borrower.name,
        borrowerEmail: borrower.email,
        endDate: loan.endDate,
        idempotencyKey,
      });
    }
    return items;
  },
});

/**
 * n8n's write-back, one row per key: a retried or replayed call with the same key and
 * status returns ok and changes nothing; only failed -> sent is an allowed upgrade.
 * Returns ok:false for data that doesn't fit, so the
 * HTTP layer can answer 400 without relying on error propagation.
 */
export const recordReminderStatus = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId || !(await ctx.db.get(loanId))) return { ok: false };
    const prefix = `${loanId}:`;
    const day = args.idempotencyKey.slice(prefix.length);
    if (!args.idempotencyKey.startsWith(prefix) || !isIsoDate(day)) return { ok: false };

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    const now = Date.now();
    if (existing) {
      // One row per key. `sent` is terminal; a later successful re-send may upgrade a
      // `failed` row so the day is closed and listOverdue stops offering the loan.
      // Any other repeat (same status, or failed after sent) changes nothing.
      if (existing.status === "failed" && args.status === "sent") {
        await ctx.db.patch(existing._id, {
          status: "sent",
          sentAt: now,
          lastError: undefined,
          attempts: existing.attempts + 1,
        });
      }
      return { ok: true };
    }

    const failure = (args.error ?? "Reminder failed").slice(0, MAX_ERROR_LENGTH);
    await ctx.db.insert("automationEvents", {
      loanId,
      kind: "overdue_reminder",
      idempotencyKey: args.idempotencyKey,
      status: args.status,
      attempts: 1,
      createdAt: now,
      ...(args.status === "sent" ? { sentAt: now } : { lastError: failure }),
    });
    return { ok: true };
  },
});
