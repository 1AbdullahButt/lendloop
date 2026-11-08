import { addDays, daysBetween } from "./dates";

/** Fewer days than this and a one-day request would fill the whole strip. */
export const MIN_STRIP_DAYS = 14;
/** Labels closer than this (in % of the strip) would collide, so the less important one goes. */
const LABEL_GAP_PCT = 15;
/** A bar narrower than this can't hold its "Nov 9–10" label, which then goes beside it. */
const BAR_LABEL_MIN_PCT = 18;

export type StripTick = { left: number; strong: boolean };
export type StripLabel = { day: string; text: "TODAY" | "DATE"; left: number; align: "start" | "center" | "end" };
export type BarLayout = { left: number; width: number; label: "inside" | "after" | "before" };

export type StripLayout = {
  start: string;
  end: string;
  span: number;
  /** Width of one day, in % of the strip. */
  cell: number;
  /** Left edge of a day's cell, in % of the strip. */
  pos: (isoDate: string) => number;
  /** Bar for a date range: whole cells, both ends counted, plus where its date label fits. */
  bar: (startDate: string, endDate: string) => BarLayout;
  /** Today's whole cell; a bar starting today begins exactly at its left edge. */
  today: { left: number; width: number };
  /** One line between every two days; strong at week steps and on the 1st of a month. */
  ticks: StripTick[];
  /** Dates under the strip (TODAY first), thinned so none collide. */
  labels: StripLabel[];
};

/**
 * Day strip for one tool, on a grid of whole days. It starts at today, or at an earlier stale
 * request's start, and ends at the last requested day (at least MIN_STRIP_DAYS long), so
 * 30-day loans and loans that cross a month fit. Bars, the today column and the ticks all use
 * the same cells, so nothing is ever half a day off.
 */
export function calendarStrip(today: string, rows: { startDate: string; endDate: string }[]): StripLayout {
  const start = [today, ...rows.map((r) => r.startDate)].sort()[0];
  const last = [today, ...rows.map((r) => r.endDate)].sort().slice(-1)[0];
  const span = Math.max(MIN_STRIP_DAYS, daysBetween(start, last) + 1);
  const end = addDays(start, span - 1);
  const cell = 100 / span;
  const pos = (d: string) => daysBetween(start, d) * cell;

  const ticks: StripTick[] = [];
  for (let k = 1; k < span; k++) {
    const day = addDays(start, k);
    ticks.push({ left: k * cell, strong: k % 7 === 0 || day.endsWith("-01") });
  }

  // Candidates in priority order: TODAY, the first and last day, month starts, week steps.
  const candidates: { day: string; text: StripLabel["text"] }[] = [
    { day: today, text: "TODAY" },
    { day: start, text: "DATE" },
    { day: end, text: "DATE" },
  ];
  for (let k = 1; k < span - 1; k++) {
    const day = addDays(start, k);
    if (day.endsWith("-01")) candidates.push({ day, text: "DATE" });
  }
  for (let k = 7; k < span - 1; k += 7) candidates.push({ day: addDays(start, k), text: "DATE" });

  const labels: StripLabel[] = [];
  const center = (d: string) => pos(d) + cell / 2;
  for (const c of candidates) {
    const at = center(c.day);
    if (labels.some((l) => l.day === c.day || Math.abs(center(l.day) - at) < LABEL_GAP_PCT)) continue;
    const align: StripLabel["align"] = at < LABEL_GAP_PCT / 2 ? "start" : at > 100 - LABEL_GAP_PCT / 2 ? "end" : "center";
    const left = align === "start" ? pos(c.day) : align === "end" ? pos(c.day) + cell : at;
    labels.push({ day: c.day, text: c.text, left, align });
  }
  labels.sort((a, b) => a.left - b.left);

  const bar = (a: string, b: string): BarLayout => {
    const left = pos(a);
    const width = (daysBetween(a, b) + 1) * cell;
    const label = width >= BAR_LABEL_MIN_PCT ? "inside" : left + width + BAR_LABEL_MIN_PCT <= 100 ? "after" : "before";
    return { left, width, label };
  };

  return { start, end, span, cell, pos, bar, today: { left: pos(today), width: cell }, ticks, labels };
}
