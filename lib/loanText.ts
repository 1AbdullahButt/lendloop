import { formatDate, formatDateRange } from "./dates";
import { firstName } from "./names";

/** Set on a pending request when an approved loan holds some of its days (loans.listMine). */
type DatesTaken = { startDate: string; endDate: string; mine: boolean } | null | undefined;

type BorrowerLoan = {
  status: string;
  lenderName: string;
  startDate: string;
  endDate: string;
  decidedAt?: number;
  datesTaken?: DatesTaken;
};

/** What a borrower is told when their pending dates are taken. */
export function datesTakenText(taken: NonNullable<DatesTaken>): string {
  return taken.mine
    ? "Your other approved loan already covers these dates, so this request can't be approved. Cancel it if you don't need it."
    : "These dates were just taken by another approved loan. Wait in case they free up, or cancel and send new dates.";
}

/** What happens next on one of my loans, in one sentence (My requests and the borrowing card). */
export function borrowerNextStep(loan: BorrowerLoan, today: string): string {
  const lender = firstName(loan.lenderName);
  switch (loan.status) {
    case "pending":
      if (loan.datesTaken && loan.startDate >= today) return datesTakenText(loan.datesTaken);
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

type MyLoanLite = { toolId: string; status: string; startDate: string; endDate: string };

/**
 * The viewer's own loan that matters on Browse for one tool: the one they hold (approved),
 * otherwise their newest pending request. `loans` is listMine's order, newest first.
 */
export function myLoanOn<T extends MyLoanLite>(loans: readonly T[] | undefined, toolId: string): T | undefined {
  const mine = (loans ?? []).filter((l) => l.toolId === toolId);
  return mine.find((l) => l.status === "approved") ?? mine.find((l) => l.status === "pending");
}

/** Status line for a tool the viewer has asked for and is waiting on. */
export function pendingLine(loan: { startDate: string; endDate: string; datesTaken?: DatesTaken }, lenderName: string): string {
  const range = formatDateRange(loan.startDate, loan.endDate);
  return loan.datesTaken ? `You asked for ${range} · those dates are now taken` : `You asked for ${range} · waiting for ${firstName(lenderName)}`;
}

/** The Browse tag for the viewer's own loan on a tool, or null when they have none there. */
export function myTagLabel(
  loan: { status: string; startDate: string; datesTaken?: DatesTaken } | undefined,
  today: string,
): string | null {
  if (loan?.status === "approved") return loan.startDate > today ? "Booked for you" : "With you";
  if (loan?.status === "pending") return loan.datesTaken ? "Dates taken" : "You asked";
  return null;
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

/** "Jake", "Jake and Sam", "Jake, Sam and Ali". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The note beside a verdict stamp: who has been emailed, including anyone whose dates this took. */
export function verdictNote(verdict: "approved" | "declined", first: string, told: string[]): string {
  if (verdict === "declined") return `${first} will get an email.`;
  const others = told.length
    ? ` ${listNames(told)} ${told.length === 1 ? "was" : "were"} told those dates are now taken.`
    : "";
  return `${first} has been emailed.${others}`;
}
