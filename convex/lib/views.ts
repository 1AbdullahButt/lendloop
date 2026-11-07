import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { typeFromKey, type LoanEventType } from "./events";

export const ACTIVITY_LIMIT = 10;

export type Activity = {
  kind: Doc<"automationEvents">["kind"];
  status: Doc<"automationEvents">["status"];
  createdAt: number;
  sentAt?: number;
  /** Which transition a request notification was about, e.g. "loan.approved". */
  type?: LoanEventType;
};

/** Worst state across a loan's notification emails; null when none were queued yet. */
export type EmailStatus = "sent" | "failed" | "queued" | null;

/** Public display info only: name and badge, never email. */
export type PersonView = { name: string; trusted: boolean };

const UNKNOWN: PersonView = { name: "Unknown neighbour", trusted: false };

/** Small per-request cache so lists don't re-read the same user or tool. */
export function makeLookups(ctx: QueryCtx) {
  const people = new Map<Id<"users">, Promise<PersonView>>();
  const tools = new Map<Id<"tools">, Promise<Doc<"tools"> | null>>();
  return {
    person(id: Id<"users">): Promise<PersonView> {
      if (!people.has(id)) {
        people.set(
          id,
          ctx.db.get(id).then((u) => (u ? { name: u.name, trusted: u.trustedLender } : UNKNOWN)),
        );
      }
      return people.get(id)!;
    },
    tool(id: Id<"tools">): Promise<Doc<"tools"> | null> {
      if (!tools.has(id)) tools.set(id, ctx.db.get(id));
      return tools.get(id)!;
    },
  };
}

/**
 * Recent automation for one loan, newest first, plus the loan's overall email status.
 * Idempotency keys and n8n error text stay out: the borrower only needs "what happened
 * and when", and which email it was.
 */
export async function loanAutomation(
  ctx: QueryCtx,
  loanId: Id<"loans">,
): Promise<{ activity: Activity[]; emailStatus: EmailStatus }> {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .collect();
  const activity = events
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, ACTIVITY_LIMIT)
    .map((e) => {
      const type = e.kind === "request_notification" ? typeFromKey(e.idempotencyKey) : null;
      return {
        kind: e.kind,
        status: e.status,
        createdAt: e.createdAt,
        ...(e.sentAt !== undefined ? { sentAt: e.sentAt } : {}),
        ...(type ? { type } : {}),
      };
    });
  // Computed over every event, not the trimmed list, so an old failure still shows.
  const notes = events.filter((e) => e.kind === "request_notification").map((e) => e.status);
  const emailStatus: EmailStatus = notes.includes("failed")
    ? "failed"
    : notes.includes("queued")
      ? "queued"
      : notes.length > 0
        ? "sent"
        : null;
  return { activity, emailStatus };
}

export async function loanActivity(ctx: QueryCtx, loanId: Id<"loans">): Promise<Activity[]> {
  return (await loanAutomation(ctx, loanId)).activity;
}
