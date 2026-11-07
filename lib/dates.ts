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

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function parts(isoDate: string) {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), ms };
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

function sameYearAsNow(year: number): boolean {
  return year === new Date().getUTCFullYear();
}

/**
 * US style: "Nov 8", or "Nov 8, 2027" outside the current year. Calendar dates are
 * rendered in UTC so they never shift by a day across time zones.
 */
export function formatDate(isoDate: string): string {
  const p = parts(isoDate);
  if (!p) return isoDate;
  const base = `${MONTH.format(p.ms)} ${p.day}`;
  return sameYearAsNow(p.year) ? base : `${base}, ${p.year}`;
}

/** "Nov 8–10", "Oct 30–Nov 2", "Nov 8" for a one-day loan. */
export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const a = parts(start);
  const b = parts(end);
  if (!a || !b) return `${start}–${end}`;
  const yearSuffix = (y: number) => (sameYearAsNow(y) ? "" : `, ${y}`);
  if (a.year === b.year && a.month === b.month) {
    return `${MONTH.format(a.ms)} ${a.day}–${b.day}${yearSuffix(b.year)}`;
  }
  if (a.year === b.year) {
    return `${MONTH.format(a.ms)} ${a.day}–${MONTH.format(b.ms)} ${b.day}${yearSuffix(b.year)}`;
  }
  return `${formatDate(start)}–${formatDate(end)}`;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

/** "Sat, Nov 7" for an ISO date. */
export function formatDayLong(isoDate: string): string {
  const p = parts(isoDate);
  return p ? `${WEEKDAY.format(p.ms)}, ${formatDate(isoDate)}` : isoDate;
}

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const LOCAL_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** A moment in the viewer's own time zone: "Nov 7 10:42 AM". */
export function formatDateTime(ms: number): string {
  return `${LOCAL_DAY.format(ms)} ${TIME.format(ms)}`;
}

/** Days an approved loan is past its end date (0 if not overdue). */
export function daysOverdue(endDate: string, today: string = todayUtc()): number {
  return Math.max(0, daysBetween(endDate, today));
}
