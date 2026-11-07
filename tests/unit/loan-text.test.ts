// The borrowing card's text for the viewer's own loan: the status line says the tool is with
// them, and the sent request's message follows the loan's live status.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { borrowerNextStep, holderLine, myLoanOn, myTagLabel, pendingLine } from "../../lib/loanText";

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

describe("my own loan on a tool, for Browse", () => {
  const drill = (status: string, startDate: string, endDate: string) => ({ toolId: "drill", status, startDate, endDate });
  // listMine order: newest first.
  const mine = [
    drill("pending", "2026-11-12", "2026-11-14"),
    drill("returned", "2026-11-01", "2026-11-03"),
    drill("pending", "2026-11-09", "2026-11-10"),
    { toolId: "saw", status: "approved", startDate: "2026-11-07", endDate: "2026-11-09" },
  ];

  test("prefers the loan I hold, else my newest pending request, else nothing", () => {
    expect(myLoanOn(mine, "saw")?.status).toBe("approved");
    expect(myLoanOn(mine, "drill")).toMatchObject({ status: "pending", startDate: "2026-11-12" });
    expect(myLoanOn(mine, "ladder")).toBeUndefined();
    expect(myLoanOn(undefined, "drill")).toBeUndefined();
  });

  test("the card's status line and the grid tag agree with My requests", () => {
    expect(pendingLine(drill("pending", "2026-11-09", "2026-11-10"), "Ben Carter")).toBe(
      "You asked for Nov 9–10 · waiting for Ben",
    );
    expect(myTagLabel({ status: "pending", startDate: "2026-11-09" }, TODAY)).toBe("You asked");
    expect(myTagLabel({ status: "approved", startDate: "2026-11-04" }, TODAY)).toBe("With you");
    expect(myTagLabel({ status: "approved", startDate: "2026-11-10" }, TODAY)).toBe("Booked for you");
    expect(myTagLabel(undefined, TODAY)).toBeNull();
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
