// Builds the borrower's "Activity" ledger for one loan from its timestamps and its
// automation events (AC19), in plain words: who did what, and which email went out.
import { formatDateRange } from "./dates";
import { firstName } from "./names";

export type LedgerTag = "you" | "lender" | "email" | "sending" | "reminder" | "failed" | "board";

export type LedgerEntry = {
  at: number | null;
  tag: LedgerTag;
  /** "email" for request notifications, "reminder" for overdue reminders, else "loan". */
  kind: "loan" | "email" | "reminder";
  status?: "queued" | "sent" | "failed";
  what: string;
};

export type LedgerLoan = {
  status: string;
  startDate: string;
  endDate: string;
  createdAt: number;
  decidedAt?: number;
  returnedAt?: number;
  lenderName: string;
  activity: Array<{
    kind: string;
    status: string;
    createdAt: number;
    sentAt?: number;
    type?: string;
  }>;
};

/** Which email a notification was, and who it went to (convex/automation.ts recipientSide). */
function emailWords(type: string | undefined, loan: LedgerLoan, lender: string) {
  switch (type) {
    case "loan.requested":
      return { sent: `${lender} was emailed about your request`, failed: `Email to ${lender} didn't go through`, queued: `Emailing ${lender}…` };
    case "loan.approved":
      return { sent: "Approval email sent to you", failed: "Approval email to you didn't go through", queued: "Sending your approval email…" };
    case "loan.declined":
      return { sent: "Decline email sent to you", failed: "Decline email to you didn't go through", queued: "Sending your decline email…" };
    case "loan.returned":
      return { sent: "Return confirmation sent to you", failed: "Return confirmation didn't go through", queued: "Sending your return confirmation…" };
    case "loan.cancelled":
      return loan.decidedAt === undefined
        ? { sent: `${lender} was emailed that you canceled`, failed: `Email to ${lender} didn't go through`, queued: `Emailing ${lender}…` }
        : { sent: "Cancellation email sent to you", failed: "Cancellation email to you didn't go through", queued: "Sending your cancellation email…" };
    case "loan.dates_taken":
      return {
        sent: "You were emailed that another approved loan took these dates",
        failed: "Email about your taken dates didn't go through",
        queued: "Emailing you that these dates were taken…",
      };
    default:
      return { sent: "Email sent", failed: "Email didn't go through", queued: "Sending email…" };
  }
}

export function buildLedger(loan: LedgerLoan): LedgerEntry[] {
  const lender = firstName(loan.lenderName);
  const range = formatDateRange(loan.startDate, loan.endDate);
  const rows: LedgerEntry[] = [{ at: loan.createdAt, tag: "you", kind: "loan", what: `You asked ${lender} for ${range}` }];

  if (loan.decidedAt !== undefined) {
    if (loan.status === "cancelled") {
      rows.push({ at: loan.decidedAt, tag: "board", kind: "loan", what: "The listing was taken down, so the request was canceled" });
    } else if (loan.status === "declined") {
      rows.push({ at: loan.decidedAt, tag: "lender", kind: "loan", what: `${lender} declined` });
    } else {
      rows.push({ at: loan.decidedAt, tag: "lender", kind: "loan", what: `${lender} approved` });
    }
  }
  if (loan.returnedAt !== undefined) {
    rows.push({ at: loan.returnedAt, tag: "lender", kind: "loan", what: `${lender} marked it returned` });
  }

  for (const a of loan.activity) {
    const status = a.status === "sent" || a.status === "failed" ? a.status : "queued";
    const at = status === "sent" && a.sentAt ? a.sentAt : a.createdAt;
    if (a.kind === "overdue_reminder") {
      rows.push({
        at,
        tag: status === "failed" ? "failed" : "reminder",
        kind: "reminder",
        status,
        what: status === "failed" ? "Overdue reminder didn't go through" : "Overdue reminder sent to you",
      });
      continue;
    }
    // A borrower's own cancel has no timestamp on the loan; its email was queued at that moment.
    if (a.type === "loan.cancelled" && loan.decidedAt === undefined) {
      rows.push({ at: a.createdAt, tag: "you", kind: "loan", what: "You canceled the request" });
    }
    const words = emailWords(a.type, loan, lender);
    rows.push({
      at,
      tag: status === "sent" ? "email" : status === "failed" ? "failed" : "sending",
      kind: "email",
      status,
      what: words[status],
    });
  }
  // Oldest first, like a card filled in over time. Stable sort keeps "asked" before its email.
  return rows.sort((x, y) => (x.at ?? 0) - (y.at ?? 0));
}
