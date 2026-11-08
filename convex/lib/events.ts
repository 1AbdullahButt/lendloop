import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type LoanEventType =
  | "loan.requested"
  | "loan.approved"
  | "loan.declined"
  | "loan.returned"
  | "loan.cancelled"
  // To a pending borrower whose dates were just covered by someone else's approved loan.
  | "loan.dates_taken";

export const LOAN_EVENT_TYPES: readonly LoanEventType[] = [
  "loan.requested",
  "loan.approved",
  "loan.declined",
  "loan.returned",
  "loan.cancelled",
  "loan.dates_taken",
];

/**
 * `<loanId>:<type>`, plus `:<blockerLoanId>` for "dates taken": one email per blocking loan,
 * so a borrower blocked again later by a different approval is told again.
 */
export function notificationKey(loanId: Id<"loans">, type: LoanEventType, suffix?: string): string {
  return suffix ? `${loanId}:${type}:${suffix}` : `${loanId}:${type}`;
}

/** Recovers the event type from the key so the row needs no extra column. */
export function typeFromKey(key: string): LoanEventType | null {
  const type = key.split(":")[1] ?? "";
  return (LOAN_EVENT_TYPES as readonly string[]).includes(type) ? (type as LoanEventType) : null;
}

/** The blocking loan's id in a "dates taken" key, or null. */
export function blockerFromKey(key: string): string | null {
  const parts = key.split(":");
  return parts[1] === "loan.dates_taken" && parts[2] ? parts[2] : null;
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
  suffix?: string,
): Promise<void> {
  const idempotencyKey = notificationKey(loanId, type, suffix);
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
