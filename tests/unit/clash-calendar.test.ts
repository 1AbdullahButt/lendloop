// The Incoming mini calendar appears only when requests on a tool clash, fitted to just those
// days (plus one each side), with the month shown where it starts or changes, the clashing days
// marked per row, and today flagged only when it falls inside.
import { describe, expect, test } from "vitest";
import { clashCalendar } from "../../lib/clashCalendar";
import { dateLine } from "../../lib/dates";

const TODAY = "2026-11-09";
let n = 0;
const req = (status: string, startDate: string, endDate: string) => ({ _id: `l${++n}`, status, startDate, endDate });

describe("clashCalendar", () => {
  test("one waiting request, or requests that don't overlap: no calendar", () => {
    expect(clashCalendar([req("pending", "2026-11-10", "2026-11-11")], TODAY)).toBeNull();
    expect(clashCalendar([req("pending", "2026-11-10", "2026-11-11"), req("pending", "2026-11-13", "2026-11-14")], TODAY)).toBeNull();
    // Declined or returned requests never count.
    expect(clashCalendar([req("pending", "2026-11-10", "2026-11-11"), req("declined", "2026-11-10", "2026-11-11")], TODAY)).toBeNull();
  });

  test("Maya Nov 10–11 and Jake Nov 11–13: Nov 9–14, one clash day, today flagged", () => {
    const maya = req("pending", "2026-11-10", "2026-11-11");
    const jake = req("pending", "2026-11-11", "2026-11-13");
    const cal = clashCalendar([maya, jake], TODAY)!;
    expect(cal.days.map((d) => d.day)).toEqual([9, 10, 11, 12, 13, 14]);
    expect(cal.days.map((d) => d.month)).toEqual(["NOV", null, null, null, null, null]);
    expect(cal.days.filter((d) => d.today).map((d) => d.iso)).toEqual(["2026-11-09"]);
    const [m, j] = cal.rows;
    expect([m.req, j.req]).toEqual([maya, jake]);
    expect([m.from, m.to, j.from, j.to]).toEqual([1, 2, 2, 4]);
    expect(m.clash.map(Boolean).indexOf(true)).toBe(2);
    expect(j.clash.filter(Boolean)).toHaveLength(1);
  });

  test("an approved loan clashing with a waiting request comes first; a non-clashing request is left out", () => {
    const approved = req("approved", "2026-11-12", "2026-11-14");
    const waiting = req("pending", "2026-11-14", "2026-11-16");
    const elsewhere = req("pending", "2026-11-25", "2026-11-26");
    const cal = clashCalendar([waiting, elsewhere, approved], TODAY)!;
    expect(cal.rows.map((r) => r.req)).toEqual([approved, waiting]);
    expect(cal.days[0].iso).toBe("2026-11-11");
    expect(cal.days.at(-1)!.iso).toBe("2026-11-17");
    expect(cal.days.some((d) => d.today)).toBe(false);
  });

  test("crossing into December shows the month again where it changes", () => {
    const cal = clashCalendar([req("pending", "2026-11-28", "2026-12-02"), req("pending", "2026-11-30", "2026-12-03")], TODAY)!;
    const months = cal.days.filter((d) => d.month).map((d) => `${d.month} ${d.day}`);
    expect(months).toEqual(["NOV 27", "DEC 1"]);
  });

  test("a 30-day request clashing with another still fits, one cell per day", () => {
    const cal = clashCalendar([req("pending", "2026-11-15", "2026-12-14"), req("pending", "2026-12-01", "2026-12-03")], TODAY)!;
    expect(cal.days).toHaveLength(32);
    expect(cal.rows[1].clash.filter(Boolean)).toHaveLength(3);
  });
});

describe("dateLine", () => {
  test("weekday, month and day for each end, and the length", () => {
    expect(dateLine("2026-11-09", "2026-11-10")).toEqual({ dates: "Mon Nov 9 → Tue Nov 10", days: "2 days" });
    expect(dateLine("2026-11-12", "2026-11-12")).toEqual({ dates: "Thu Nov 12", days: "1 day" });
  });
});
