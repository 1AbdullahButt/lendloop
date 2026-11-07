// Per-user time zones, shared by Convex and the browser (dependency-free).
// A user's "today" is the calendar day in their own zone; users without one use UTC.

/** Zone for users who have not stored one yet (and the overdue job, which is always UTC). */
export const DEFAULT_TIME_ZONE = "UTC";

// IANA names only: "UTC", "Etc/GMT+5" or Area/Location such as "Asia/Karachi" and
// "America/Argentina/Buenos_Aires". Intl also accepts raw offsets ("+05:00"), which are not
// zones (no daylight saving rules), so the shape is checked before Intl is asked.
const IANA_NAME = /^(?:UTC|Etc\/[A-Za-z0-9+-]+|[A-Z][A-Za-z_-]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;

/** True for a real IANA time zone name that this runtime's Intl knows. */
export function isValidTimeZone(name: string): boolean {
  if (name.length > 64 || !IANA_NAME.test(name)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** The calendar day (YYYY-MM-DD) that `now` falls on in `timeZone`; UTC when unset or unknown. */
export function todayIn(timeZone: string | undefined, now: number = Date.now()): string {
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  let format = dayFormats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(zone, format);
  }
  const parts = format.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
