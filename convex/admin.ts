import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { appError } from "./lib/errors";
import { isCurrentEmail } from "./lib/announces";
import { blockerFromKey, typeFromKey } from "./lib/events";
import { datesOverlap } from "./lib/clash";
import { softRemoveTool } from "./lib/removal";
import { makeLookups } from "./lib/views";
import { displayName, maskEmail } from "./lib/public";
import { eventKind, eventStatus } from "./schema";

const DEFAULT_EVENT_LIMIT = 200;

export const listAllLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const lookups = makeLookups(ctx);
    const loans = await ctx.db.query("loans").order("desc").collect();
    return await Promise.all(
      loans.map(async (l) => {
        const tool = await lookups.tool(l.toolId);
        const borrower = await lookups.person(l.borrowerId);
        const lender = await lookups.person(l.lenderId);
        return {
          _id: l._id,
          toolId: l.toolId,
          toolName: tool?.name ?? "Deleted tool",
          toolRemoved: !tool || tool.removedAt !== undefined,
          borrowerName: borrower.name,
          lenderName: lender.name,
          lenderTrusted: lender.trusted,
          startDate: l.startDate,
          endDate: l.endDate,
          status: l.status,
          decidedAt: l.decidedAt,
        };
      }),
    );
  },
});

/** Includes removed tools: moderation needs the full picture. */
export const listTools = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const lookups = makeLookups(ctx);
    const tools = await ctx.db.query("tools").order("desc").collect();
    return await Promise.all(
      tools.map(async (t) => {
        const owner = await lookups.person(t.ownerId);
        return { _id: t._id, ownerId: t.ownerId, name: t.name, status: t.status, removedAt: t.removedAt, ownerName: owner.name };
      }),
    );
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    // Short names and a masked email: enough to recognize and moderate an account, while the
    // full address never reaches the browser.
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: displayName(u.name),
      emailHint: maskEmail(u.email),
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

/** Outbound and reminder log, newest first; failed rows carry `lastError` (AC17). */
export const listAutomationEvents = query({
  args: {
    status: v.optional(eventStatus),
    kind: v.optional(eventKind),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? DEFAULT_EVENT_LIMIT), 1), 1000);
    const events = await ctx.db.query("automationEvents").collect();
    return events
      .filter((e) => (!args.status || e.status === args.status) && (!args.kind || e.kind === args.kind))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((e) => ({
        _id: e._id,
        loanId: e.loanId,
        kind: e.kind,
        // Parsed here so the browser never sees idempotency keys.
        type: e.kind === "request_notification" ? typeFromKey(e.idempotencyKey) : null,
        blockerLoanId: blockerFromKey(e.idempotencyKey),
        status: e.status,
        attempts: e.attempts,
        lastError: e.lastError,
        createdAt: e.createdAt,
      }));
  },
});

/** Moderation removal: works even while on loan; the active loan stays returnable. */
export const removeListing = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool) throw appError("NOT_FOUND", "Tool not found.");
    if (tool.removedAt !== undefined) return null;
    await softRemoveTool(ctx, tool);
    return null;
  },
});

/** Touches `trustedLender` only; role changes are dashboard-only (users.setRole). */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw appError("NOT_FOUND", "User not found.");
    await ctx.db.patch(user._id, { trustedLender: args.trusted });
    return null;
  },
});

/**
 * Re-queues a request notification that gave up after its retries. It reuses the same row
 * and idempotency key, so a resend can never create a second notification for one
 * transition. A resend is a single extra attempt: attempts is already at the maximum, so if
 * it fails again markFailed marks it failed instead of starting a new retry chain.
 * Only an email that still describes the loan is resent: "new request" after the borrower
 * cancelled, or "approved" after the return, would mislead the recipient.
 */
export const resendEvent = mutation({
  args: { eventId: v.id("automationEvents") },
  handler: async (ctx, { eventId }) => {
    await requireAdmin(ctx);
    const event = await ctx.db.get(eventId);
    if (!event) throw appError("NOT_FOUND", "Event not found.");
    if (event.kind !== "request_notification") {
      throw appError("INVALID", "Overdue reminders are retried by the daily n8n workflow.");
    }
    if (event.status !== "failed") {
      const why = event.status === "queued" ? "is already being sent" : "was already sent";
      throw appError("CONFLICT", `This email ${why}.`);
    }
    const loan = await ctx.db.get(event.loanId);
    if (!loan) throw appError("NOT_FOUND", "The loan for this email no longer exists.");
    // Once the loan has moved past the transition this email announces, it is stale.
    const blockerId = blockerFromKey(event.idempotencyKey);
    const blockerKey = blockerId ? ctx.db.normalizeId("loans", blockerId) : null;
    const blocker = blockerKey ? await ctx.db.get(blockerKey) : null;
    const stillBlocked = Boolean(blocker && blocker.status === "approved" && datesOverlap(blocker, loan));
    if (!isCurrentEmail(typeFromKey(event.idempotencyKey), loan.status, stillBlocked)) {
      if (blockerId && loan.status === "pending") {
        throw appError("CONFLICT", "This email is out of date: those dates are free again.");
      }
      const now = loan.status === "cancelled" ? "canceled" : loan.status;
      throw appError("CONFLICT", `This email is out of date: the request is now ${now}.`);
    }
    // lastAttemptAt restarts the stuck-email clock (automation.sweepStuck) for this attempt.
    await ctx.db.patch(eventId, { status: "queued", lastError: undefined, lastAttemptAt: Date.now() });
    // Mutations never call the network: delivery stays in the internal action.
    await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
    return null;
  },
});
