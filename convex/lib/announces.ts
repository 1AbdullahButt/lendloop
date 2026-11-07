// The loan status each notification type announces. Shared by admin.resendEvent (which
// refuses a resend once the loan has moved on) and the UI (lib/loanEmail.ts), so the two
// can't drift. Kept free of imports so the client can bundle it.
export const ANNOUNCES = {
  "loan.requested": "pending",
  "loan.approved": "approved",
  "loan.declined": "declined",
  "loan.returned": "returned",
  "loan.cancelled": "cancelled",
} as const;

/** True while a notification still describes the loan, so resending it makes sense. */
export function isCurrentEmail(type: string | null | undefined, loanStatus: string): boolean {
  return Boolean(type && type in ANNOUNCES && ANNOUNCES[type as keyof typeof ANNOUNCES] === loanStatus);
}
