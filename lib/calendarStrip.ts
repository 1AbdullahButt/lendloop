import { addDays, daysBetween } from "./dates";

/** Fewer days than this and a one-day request would fill the whole strip. */
export const MIN_STRIP_DAYS = 14;
/** How close (in % of the strip) the TODAY label may get to an edge label before that edge label is dropped. */
const LABEL_GAP_PCT = 18;

export type StripLayout = {
  start: string;
  end: string;
  span: number;
  /** Left edge of a day's cell, in % of the strip. */
  pos: (isoDate: string) => number;
  /** Width of a date range's bar, in % of the strip. */
  width: (startDate: string, endDate: string) => number;
  /** Center of today's cell, where the marker and the TODAY label sit. */
  todayPct: number;
  /** Edge date labels, or null where TODAY already marks that end or would collide with it. */
  startLabel: string | null;
  endLabel: string | null;
  /** Keeps the TODAY label inside the strip when today sits near an edge. */
  todayAlign: "start" | "center" | "end";
};

/**
 * Day strip for one tool. It starts at today, or at the earliest requested start if that is
 * earlier (a stale request), so the left edge is never a day nobody asked for. It ends at the
 * last requested day, and spans at least MIN_STRIP_DAYS.
 */
export function calendarStrip(today: string, rows: { startDate: string; endDate: string }[]): StripLayout {
  const start = [today, ...rows.map((r) => r.startDate)].sort()[0];
  const last = [today, ...rows.map((r) => r.endDate)].sort().slice(-1)[0];
  const span = Math.max(MIN_STRIP_DAYS, daysBetween(start, last) + 1);
  const end = addDays(start, span - 1);
  const pos = (d: string) => (daysBetween(start, d) / span) * 100;
  const todayPct = pos(today) + 100 / span / 2;
  return {
    start,
    end,
    span,
    pos,
    width: (a, b) => ((daysBetween(a, b) + 1) / span) * 100,
    todayPct,
    startLabel: start === today || todayPct < LABEL_GAP_PCT ? null : start,
    endLabel: todayPct > 100 - LABEL_GAP_PCT ? null : end,
    todayAlign: todayPct < LABEL_GAP_PCT / 2 ? "start" : todayPct > 100 - LABEL_GAP_PCT / 2 ? "end" : "center",
  };
}
