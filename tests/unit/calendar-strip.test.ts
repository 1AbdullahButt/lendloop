// The Incoming day strip sits on a grid of whole days: bars, the today column and the ticks
// share cell edges, labels never collide, and it copes with 30-day loans and month changes.
import { describe, expect, test } from "vitest";
import { MIN_STRIP_DAYS, calendarStrip } from "../../lib/calendarStrip";

const TODAY = "2026-11-09";
const req = (startDate: string, endDate: string) => ({ startDate, endDate });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("calendarStrip", () => {
  test("a request starting today starts exactly on the today column", () => {
    const s = calendarStrip(TODAY, [req("2026-11-09", "2026-11-10")]);
    expect(s.start).toBe(TODAY);
    expect(s.span).toBe(MIN_STRIP_DAYS);
    const bar = s.bar("2026-11-09", "2026-11-10");
    close(bar.left, s.today.left);
    close(bar.width, 2 * s.cell);
    close(s.today.width, s.cell);
  });

  test("bars and ticks share the same cell edges", () => {
    const s = calendarStrip(TODAY, [req("2026-11-10", "2026-11-12")]);
    const bar = s.bar("2026-11-10", "2026-11-12");
    const edges = s.ticks.map((t) => t.left);
    expect(edges.some((e) => Math.abs(e - bar.left) < 1e-9)).toBe(true);
    expect(edges.some((e) => Math.abs(e - (bar.left + bar.width)) < 1e-9)).toBe(true);
    expect(s.ticks).toHaveLength(s.span - 1);
  });

  test("labels: TODAY always, never two closer than the gap, the strip never starts before today without a reason", () => {
    const s = calendarStrip(TODAY, [req("2026-11-10", "2026-11-12")]);
    expect(s.labels.map((l) => l.text)).toContain("TODAY");
    expect(s.labels.filter((l) => l.day === TODAY)).toHaveLength(1);
    const lefts = s.labels.map((l) => l.left);
    for (let i = 1; i < lefts.length; i++) expect(lefts[i] - lefts[i - 1]).toBeGreaterThanOrEqual(10);
    expect(s.labels.find((l) => l.text === "TODAY")!.align).toBe("start");
  });

  test("a 30-day loan crossing into December: week ticks, a Dec 1 tick and label", () => {
    const s = calendarStrip(TODAY, [req("2026-11-15", "2026-12-14")]);
    expect(s.end).toBe("2026-12-14");
    expect(s.span).toBe(36);
    const dec1 = s.pos("2026-12-01");
    expect(s.ticks.find((t) => Math.abs(t.left - dec1) < 1e-9)?.strong).toBe(true);
    expect(s.ticks.filter((t) => t.strong).length).toBeGreaterThanOrEqual(5);
    expect(s.labels.map((l) => l.day)).toContain("2026-12-01");
    expect(s.bar("2026-11-15", "2026-12-14").label).toBe("inside");
  });

  test("a stale request moves the start back, and its start date is labeled", () => {
    const s = calendarStrip(TODAY, [req("2026-11-03", "2026-11-05"), req("2026-11-10", "2026-11-11")]);
    expect(s.start).toBe("2026-11-03");
    expect(s.labels.map((l) => l.day)).toContain("2026-11-03");
  });

  test("short bars put their dates beside them, before the bar near the right end", () => {
    const s = calendarStrip(TODAY, [req("2026-11-10", "2026-11-10"), req("2026-11-22", "2026-11-22")]);
    expect(s.bar("2026-11-10", "2026-11-10").label).toBe("after");
    expect(s.bar("2026-11-22", "2026-11-22").label).toBe("before");
  });
});
