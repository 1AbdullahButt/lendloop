// The borrowing card's text for the viewer's own loan: the status line says the tool is with
// them, and the sent request's message follows the loan's live status.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { borrowerNextStep, holderLine } from "../../lib/loanText";

const TODAY = "2026-11-07";
const loan = (status: string, startDate = "2026-11-07", endDate = "2026-11-09") => ({
  status,
  lenderName: "Ben Carter",
  startDate,
  endDate,
  decidedAt: status === "pending" ? undefined : 1,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 10, 7, 12));
});
afterEach(() => vi.useRealTimers());

describe("holderLine", () => {
  test("the current borrower sees 'With you' and the due date", () => {
    expect(holderLine(loan("approved"), TODAY)).toBe("With you · due Nov 9");
  });
  test("an approved loan that starts later is booked, not with you yet", () => {
    expect(holderLine(loan("approved", "2026-11-10", "2026-11-12"), TODAY)).toBe("Booked for you · Nov 10–12");
  });
  test("past the end date it says when it was due", () => {
    expect(holderLine(loan("approved", "2026-11-03", "2026-11-05"), TODAY)).toBe("With you · was due Nov 5");
  });
});

describe("borrowerNextStep follows the live status", () => {
  test.each([
    ["approved", "You have it. It's due back Nov 9."],
    ["declined", "Ben couldn't lend it for those dates."],
    ["returned", "Returned. Thanks for looking after it."],
  ])("%s", (status, text) => {
    expect(borrowerNextStep(loan(status), TODAY)).toBe(text);
  });
});
