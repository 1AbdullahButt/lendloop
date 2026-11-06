const DAY_MS = 24 * 60 * 60 * 1000;

/** Latest end date the form offers: start + 30 days, matching convex/loans.ts (server re-checks). */
export const MAX_LOAN_EXTRA_DAYS = 30;

/** Today as YYYY-MM-DD in UTC — the same clock Convex uses for R2. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** "6 Nov 2026" — rendered in UTC so the date never shifts by a day across time zones. */
export function formatDate(isoDate: string): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(ms);
}

export function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}
