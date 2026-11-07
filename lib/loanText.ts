import { formatDate, formatDateRange } from "./dates";
import { firstName } from "./names";

type BorrowerLoan = {
  status: string;
  lenderName: string;
  startDate: string;
  endDate: string;
  decidedAt?: number;
};

/** What happens next on one of my loans, in one sentence (My requests and the borrowing card). */
export function borrowerNextStep(loan: BorrowerLoan, today: string): string {
  const lender = firstName(loan.lenderName);
  switch (loan.status) {
    case "pending":
      return loan.startDate < today
        ? `Your start date has passed, so ${lender} can only decline this. Cancel it and ask again with new dates.`
        : `Waiting for ${lender}, who can say yes until ${formatDate(loan.startDate)}, your start date. After that the request lapses.`;
    case "approved":
      if (loan.endDate < today) return `You have it. A reminder goes out each morning until ${lender} marks it returned.`;
      if (loan.startDate > today) return `${lender} said yes. It's yours from ${formatDate(loan.startDate)} and due back ${formatDate(loan.endDate)}.`;
      return `You have it. It's due back ${formatDate(loan.endDate)}.`;
    case "declined":
      return `${lender} couldn't lend it for those dates.`;
    case "returned":
      return "Returned. Thanks for looking after it.";
    default:
      return loan.decidedAt === undefined
        ? "You canceled this request."
        : "This listing was taken down, so the request was canceled.";
  }
}

/**
 * The borrowing card's status line when the viewer holds the approved loan, instead of
 * "Out on loan right now", which reads as if someone else has it.
 */
export function holderLine(loan: { startDate: string; endDate: string }, today: string): string {
  if (loan.startDate > today) return `Booked for you · ${formatDateRange(loan.startDate, loan.endDate)}`;
  if (loan.endDate < today) return `With you · was due ${formatDate(loan.endDate)}`;
  return `With you · due ${formatDate(loan.endDate)}`;
}
