import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type LoanEventType =
  | "loan.requested"
  | "loan.approved"
  | "loan.declined"
  | "loan.returned"
  | "loan.cancelled";

export const LOAN_EVENT_TYPES: readonly LoanEventType[] = [
  "loan.requested",
  "loan.approved",
  "loan.declined",
  "loan.returned",
  "loan.cancelled",
];

export function notificationKey(loanId: Id<"loans">, type: LoanEventType): string {
  return `${loanId}:${type}`;
}

/** Recovers the event type from `<loanId>:<type>` so the row needs no extra column. */
export function typeFromKey(key: string): LoanEventType | null {
  const type = key.slice(key.indexOf(":") + 1);
  return (LOAN_EVENT_TYPES as readonly string[]).includes(type) ? (type as LoanEventType) : null;
}

/**
 * Mutations never call the network: they log a queued event and hand delivery to an
 * internal action. The key makes a transition notify at most once (R7 lets each
 * transition happen once per loan), so a duplicate call queues nothing.
 */
export async function queueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: LoanEventType,
): Promise<void> {
  const idempotencyKey = notificationKey(loanId, type);
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing) return;

  const eventId = await ctx.db.insert("automationEvents", {
    loanId,
    kind: "request_notification",
    idempotencyKey,
    status: "queued",
    attempts: 0,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
}
