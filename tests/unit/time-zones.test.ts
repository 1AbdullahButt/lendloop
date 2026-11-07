// Per-user time zones on the client: what counts as a real zone, which day it is there, and
// how dates, "today" and times read for a user in New York at 9 PM and one in Karachi at 1 AM.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  askedLabel,
  formatDate,
  formatDateTime,
  formatDayLong,
  formatTime,
  isValidTimeZone,
  todayIn,
} from "../../lib/dates";

// 9:00 PM on Sat, Nov 7 in New York (EST, UTC-5) is 02:00 on Nov 8 in UTC.
const NY_9PM = Date.UTC(2026, 10, 8, 2, 0);
// 1:31 AM on Sun, Nov 8 in Karachi (UTC+5) is 20:31 on Nov 7 in UTC.
const KARACHI_131AM = Date.UTC(2026, 10, 7, 20, 31);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(KARACHI_131AM);
});
afterEach(() => vi.useRealTimers());

describe("isValidTimeZone", () => {
  test.each(["Asia/Karachi", "America/New_York", "America/Argentina/Buenos_Aires", "Europe/London", "UTC", "Etc/GMT+5"])(
    "accepts %s",
    (zone) => expect(isValidTimeZone(zone)).toBe(true),
  );
  test.each(["", "+05:00", "GMT+5", "Mars/Olympus", "asia/karachi", "Asia/Karachi; drop", "x".repeat(80)])(
    "rejects %j",
    (zone) => expect(isValidTimeZone(zone)).toBe(false),
  );
});

describe("todayIn", () => {
  test("New York at 9 PM is still Nov 7 while UTC is already Nov 8", () => {
    expect(todayIn("America/New_York", NY_9PM)).toBe("2026-11-07");
    expect(todayIn("UTC", NY_9PM)).toBe("2026-11-08");
  });
  test("Karachi at 1:31 AM is already Nov 8 while UTC is still Nov 7", () => {
    expect(todayIn("Asia/Karachi", KARACHI_131AM)).toBe("2026-11-08");
    expect(todayIn("UTC", KARACHI_131AM)).toBe("2026-11-07");
  });
  test("no zone, or an unknown one, means UTC", () => {
    expect(todayIn(undefined, KARACHI_131AM)).toBe("2026-11-07");
    expect(todayIn("Mars/Olympus", KARACHI_131AM)).toBe("2026-11-07");
  });
});

describe("one zone for everything a user sees", () => {
  test("Karachi at 1:31 AM: today, the card header, Incoming and Activity all say Nov 8", () => {
    const zone = "Asia/Karachi";
    const shown = [
      `Today is ${formatDayLong(todayIn(zone, KARACHI_131AM))} · ${zone}`,
      `Asked ${formatDate(todayIn(zone, KARACHI_131AM))}`,
      askedLabel(KARACHI_131AM, KARACHI_131AM + 60_000, zone),
      formatDateTime(KARACHI_131AM, zone),
    ];
    expect(shown).toEqual([
      "Today is Sun, Nov 8 · Asia/Karachi",
      "Asked Nov 8",
      "Asked today, 1:31 AM GMT+5",
      "Nov 8 1:31 AM GMT+5",
    ]);
    expect(shown.join(" ")).not.toContain("Nov 7");
  });

  test("New York at 9 PM: the same moment reads Nov 7, with its own zone name", () => {
    const zone = "America/New_York";
    expect(formatDayLong(todayIn(zone, NY_9PM))).toBe("Sat, Nov 7");
    expect(formatDateTime(NY_9PM, zone)).toBe("Nov 7 9:00 PM EST");
    expect(askedLabel(NY_9PM, NY_9PM + 60_000, zone)).toBe("Asked today, 9:00 PM EST");
  });

  test("'asked' flips to yesterday at the user's midnight, not UTC's", () => {
    const zone = "Asia/Karachi";
    // 11:50 PM on Nov 8 in Karachi is 18:50 UTC: still the same local day.
    expect(askedLabel(KARACHI_131AM, Date.UTC(2026, 10, 8, 18, 50), zone)).toBe("Asked today, 1:31 AM GMT+5");
    // 12:10 AM on Nov 9 in Karachi.
    expect(askedLabel(KARACHI_131AM, Date.UTC(2026, 10, 8, 19, 10), zone)).toBe("Asked yesterday");
    expect(formatTime(KARACHI_131AM, "UTC")).toBe("8:31 PM UTC");
  });
});
