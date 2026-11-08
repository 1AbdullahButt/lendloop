// Every date, "today" and time a user sees is in their own time zone (users.timeZone,
// defaulting to the browser's). Calendar dates (loan start and end) are zone-less days and
// render as-is; moments (createdAt, sentAt) are converted, and times name their zone.
// The server checks R2 against the same per-user "today" (convex/lib/zones.ts).
import { todayIn } from "../convex/lib/zones";

export { DEFAULT_TIME_ZONE, isValidTimeZone, todayIn } from "../convex/lib/zones";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Longest loan in calendar days, counting both ends, matching convex/loans.ts (server re-checks). */
export const MAX_LOAN_DAYS = 30;

/** The UTC calendar day (YYYY-MM-DD) a moment falls on: the overdue job's clock. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** Days a loan lasts, counting the first and the last day: Nov 7–9 is 3. */
export function loanLength(start: string, end: string): number {
  return daysBetween(start, end) + 1;
}

/** The latest end date allowed for a loan starting on `start`. */
export function lastAllowedEnd(start: string): string {
  return addDays(start, MAX_LOAN_DAYS - 1);
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

/** "Sun Nov 9" (no comma), for the request date line. */
export function formatDayShort(isoDate: string): string {
  const p = parts(isoDate);
  return p ? `${WEEKDAY.format(p.ms)} ${formatDate(isoDate)}` : isoDate;
}

/** A request's dates as one line: { dates: "Sun Nov 9 → Mon Nov 10", days: "2 days" }. */
export function dateLine(start: string, end: string): { dates: string; days: string } {
  const n = daysBetween(start, end) + 1;
  const dates = start === end ? formatDayShort(start) : `${formatDayShort(start)} → ${formatDayShort(end)}`;
  return { dates, days: `${n} ${n === 1 ? "day" : "days"}` };
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** A moment's time of day in `zone`, with the zone's short name: "1:31 AM GMT+5", "9:00 PM EST". */
export function formatTime(ms: number, zone: string): string {
  let format = timeFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" });
    timeFormats.set(zone, format);
  }
  return format.format(ms);
}

/** A moment in `zone`: "Nov 8 1:31 AM GMT+5". */
export function formatDateTime(ms: number, zone: string): string {
  return `${formatDate(todayIn(zone, ms))} ${formatTime(ms, zone)}`;
}

/** "Asked today, 1:31 AM GMT+5", "Asked yesterday" or "Asked Nov 5", by the day in `zone`. */
export function askedLabel(createdAt: number, now: number, zone: string): string {
  const day = todayIn(zone, createdAt);
  const today = todayIn(zone, now);
  if (day === today) return `Asked today, ${formatTime(createdAt, zone)}`;
  if (day === addDays(today, -1)) return "Asked yesterday";
  return `Asked ${formatDate(day)}`;
}

/** Days an approved loan is past its end date (0 if not overdue). */
export function daysOverdue(endDate: string, today: string): number {
  return Math.max(0, daysBetween(endDate, today));
}
