// Splits the admin email log into what needs an admin (shown) and failures that are out of date
// (collapsed under "Older failures"). Nothing is deleted: the split is display only.
import { datesOverlap } from "../convex/lib/clash";
import { isCurrentEmail } from "../convex/lib/announces";

type LoanLike = { status: string; startDate: string; endDate: string };
type EventLike = { _id: string; kind: string; status: string; loanId: string; type: string | null; blockerLoanId: string | null };

/**
 * A failed request email is out of date when the loan has moved past it (or is gone), or, for
 * "dates taken", when the blocking loan no longer holds the dates. Overdue reminders are never
 * out of date here: the daily workflow tries them again.
 */
export function isStaleFailure<E extends EventLike>(event: E, loans: Map<string, LoanLike>): boolean {
  if (event.status !== "failed" || event.kind !== "request_notification") return false;
  const loan = loans.get(event.loanId);
  if (!loan) return true;
  const blocker = event.blockerLoanId ? loans.get(event.blockerLoanId) : undefined;
  const stillBlocked = Boolean(blocker && blocker.status === "approved" && datesOverlap(blocker, loan));
  return !isCurrentEmail(event.type, loan.status, stillBlocked);
}

/** Order is kept within each list (newest first, as the query returns them). */
export function splitFailures<E extends EventLike>(events: E[], loans: Map<string, LoanLike>): { active: E[]; older: E[] } {
  const active: E[] = [];
  const older: E[] = [];
  for (const e of events) (isStaleFailure(e, loans) ? older : active).push(e);
  return { active, older };
}
