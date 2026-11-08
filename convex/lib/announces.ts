// The loan status each notification type announces. Shared by admin.resendEvent (which
// refuses a resend once the loan has moved on) and the UI (lib/loanEmail.ts), so the two
// can't drift. Kept free of imports so the client can bundle it.
export const ANNOUNCES = {
  "loan.requested": "pending",
  "loan.approved": "approved",
  "loan.declined": "declined",
  "loan.returned": "returned",
  "loan.cancelled": "cancelled",
  "loan.dates_taken": "pending",
} as const;

/**
 * True while a notification still describes the loan, so resending it makes sense. A "dates
 * taken" email also needs its blocking loan to still hold those dates (`stillBlocked`).
 */
export function isCurrentEmail(type: string | null | undefined, loanStatus: string, stillBlocked = true): boolean {
  if (!type || !(type in ANNOUNCES) || ANNOUNCES[type as keyof typeof ANNOUNCES] !== loanStatus) return false;
  return type !== "loan.dates_taken" || stillBlocked;
}
