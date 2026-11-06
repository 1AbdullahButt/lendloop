const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const format = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** "2 minutes ago", "3 days ago", "just now". Future times (clock skew) read as "just now". */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  if (diff < 60 * 1000) return "just now";
  for (const [unit, ms] of UNITS) {
    if (diff >= ms) return format.format(-Math.floor(diff / ms), unit);
  }
  return "just now";
}
