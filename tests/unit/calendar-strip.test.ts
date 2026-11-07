// The Incoming day strip starts at today (or an earlier, stale request), and its edge labels
// never sit on top of TODAY or name a day nobody asked for.
import { describe, expect, test } from "vitest";
import { MIN_STRIP_DAYS, calendarStrip } from "../../lib/calendarStrip";

const TODAY = "2026-11-07";
const req = (startDate: string, endDate: string) => ({ startDate, endDate });

describe("calendarStrip", () => {
  test("a request starting today: the strip starts at today, with TODAY as its only left label", () => {
    const s = calendarStrip(TODAY, [req("2026-11-07", "2026-11-09")]);
    expect(s.start).toBe(TODAY);
    expect(s.startLabel).toBeNull();
    expect(s.todayAlign).toBe("start");
    expect(s.span).toBe(MIN_STRIP_DAYS);
    expect(s.end).toBe("2026-11-20");
    expect(s.endLabel).toBe("2026-11-20");
    expect(s.pos("2026-11-07")).toBe(0);
  });

  test("requests that start later still start the strip at today, never the day before", () => {
    const s = calendarStrip(TODAY, [req("2026-11-10", "2026-11-12")]);
    expect(s.start).toBe(TODAY);
    expect(s.startLabel).toBeNull();
  });

  test("a stale request starts the strip at its own start date, which is then labeled", () => {
    const s = calendarStrip(TODAY, [req("2026-11-03", "2026-11-05"), req("2026-11-08", "2026-11-09")]);
    expect(s.start).toBe("2026-11-03");
    expect(s.startLabel).toBe("2026-11-03");
    expect(s.todayAlign).toBe("center");
  });

  test("a stale start just before today would collide with TODAY, so that label is dropped", () => {
    const s = calendarStrip(TODAY, [req("2026-11-06", "2026-11-08")]);
    expect(s.start).toBe("2026-11-06");
    expect(s.startLabel).toBeNull();
  });

  test("long requests stretch the strip to their last day", () => {
    const s = calendarStrip(TODAY, [req("2026-11-07", "2026-11-30")]);
    expect(s.end).toBe("2026-11-30");
    expect(s.span).toBe(24);
    expect(s.width("2026-11-07", "2026-11-30")).toBe(100);
  });

  test("today at the right end: the end label gives way and TODAY stays inside the strip", () => {
    const s = calendarStrip(TODAY, [req("2026-10-20", "2026-10-22")]);
    expect(s.end).toBe("2026-11-07");
    expect(s.endLabel).toBeNull();
    expect(s.todayAlign).toBe("end");
  });
});
