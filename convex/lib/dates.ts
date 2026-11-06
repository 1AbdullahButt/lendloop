// Dates are plain "YYYY-MM-DD" strings in UTC. Canonical strings compare correctly
// with < and >, which is why parsing is strict (no "2026-11-6", no "2027-02-30").

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Epoch-day number for a real calendar date, or null if the string is not one. */
export function parseIsoDate(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  // Date.UTC rolls 2027-02-30 over to March; a round trip catches that.
  if (new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return ms / DAY_MS;
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

/** Whole days from `from` to `to` (both must be valid ISO dates). */
export function daysBetween(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || b === null) throw new Error("daysBetween needs valid ISO dates");
  return b - a;
}

/** Inclusive ranges: a loan ending on day X still holds the tool on day X. */
export function rangesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 <= e2 && s2 <= e1;
}

export function addDaysUtc(isoDate: string, days: number): string {
  const base = parseIsoDate(isoDate);
  if (base === null) throw new Error("addDaysUtc needs a valid ISO date");
  return new Date((base + days) * DAY_MS).toISOString().slice(0, 10);
}
