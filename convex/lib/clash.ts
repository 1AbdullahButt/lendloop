// "Dates taken": which pending requests a new approval blocks. Dependency-free, so the server
// (who to email) and the lender's Incoming page (who it says was told) use the same rule.

type LoanLike = { _id: string; borrowerId: string; status: string; startDate: string; endDate: string };

/** Inclusive: a loan ending on day X still holds the tool on day X. */
export function datesOverlap(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/**
 * The other pending requests on the same tool that `approved` newly blocks, so their borrowers
 * should hear about it. A request is skipped when:
 * - it doesn't overlap the approved dates;
 * - it was already blocked by another approved loan (its borrower was told then);
 * - its start date has passed (it can't be approved anyway);
 * - it belongs to the same borrower (their own loan, not someone else's).
 * `onTool` is every loan on the tool, with `approved` already counted as approved or not.
 */
export function newlyBlocked<T extends LoanLike>(approved: LoanLike, onTool: readonly T[], today: string): T[] {
  const otherApproved = onTool.filter((l) => l.status === "approved" && l._id !== approved._id);
  return onTool.filter(
    (l) =>
      l._id !== approved._id &&
      l.status === "pending" &&
      l.borrowerId !== approved.borrowerId &&
      l.startDate >= today &&
      datesOverlap(l, approved) &&
      !otherApproved.some((o) => datesOverlap(o, l)),
  );
}

/** The approved loan currently covering a pending request's dates, if any. */
export function blockingLoan<T extends LoanLike>(request: LoanLike, onTool: readonly T[]): T | undefined {
  return onTool.find((l) => l.status === "approved" && l._id !== request._id && datesOverlap(l, request));
}
