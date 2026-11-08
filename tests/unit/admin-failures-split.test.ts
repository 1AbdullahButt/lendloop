// Admin "Older failures": failed emails the loan has moved past are split out (collapsed in the
// UI); actionable failures, sent/queued rows and overdue reminders stay in the main table.
import { describe, expect, test } from "vitest";
import { isStaleFailure, splitFailures } from "../../lib/adminEvents";

const loan = (status: string, startDate = "2026-11-10", endDate = "2026-11-12") => ({ status, startDate, endDate });
const loans = new Map([
  ["L-pending", loan("pending")],
  ["L-cancelled", loan("cancelled")],
  ["L-approved", loan("approved")],
  ["B-holds", loan("approved", "2026-11-11", "2026-11-13")],
  ["B-returned", loan("returned", "2026-11-11", "2026-11-13")],
]);
let n = 0;
const ev = (over: Partial<{ kind: string; status: string; loanId: string; type: string | null; blockerLoanId: string | null }>) => ({
  _id: `e${++n}`,
  kind: "request_notification",
  status: "failed",
  loanId: "L-pending",
  type: "loan.requested",
  blockerLoanId: null,
  ...over,
});

describe("isStaleFailure", () => {
  test("a failed email that still describes the loan is actionable", () => {
    expect(isStaleFailure(ev({}), loans)).toBe(false);
    expect(isStaleFailure(ev({ loanId: "L-approved", type: "loan.approved" }), loans)).toBe(false);
  });

  test("the loan moved on, or is gone: out of date", () => {
    expect(isStaleFailure(ev({ loanId: "L-cancelled" }), loans)).toBe(true);
    expect(isStaleFailure(ev({ loanId: "L-approved" }), loans)).toBe(true);
    expect(isStaleFailure(ev({ loanId: "missing" }), loans)).toBe(true);
  });

  test("dates taken: stale once the blocker no longer holds the dates", () => {
    const dt = { type: "loan.dates_taken" };
    expect(isStaleFailure(ev({ ...dt, blockerLoanId: "B-holds" }), loans)).toBe(false);
    expect(isStaleFailure(ev({ ...dt, blockerLoanId: "B-returned" }), loans)).toBe(true);
  });

  test("never stale: sent or queued rows and overdue reminders", () => {
    expect(isStaleFailure(ev({ loanId: "L-cancelled", status: "sent" }), loans)).toBe(false);
    expect(isStaleFailure(ev({ loanId: "L-cancelled", status: "queued" }), loans)).toBe(false);
    expect(isStaleFailure(ev({ loanId: "L-cancelled", kind: "overdue_reminder", type: null }), loans)).toBe(false);
  });
});

test("splitFailures keeps every event, in order, in exactly one list", () => {
  const events = [ev({}), ev({ loanId: "L-cancelled" }), ev({ status: "sent" }), ev({ loanId: "missing" })];
  const { active, older } = splitFailures(events, loans);
  expect(active.map((e) => e._id)).toEqual([events[0]._id, events[2]._id]);
  expect(older.map((e) => e._id)).toEqual([events[1]._id, events[3]._id]);
  expect(active.length + older.length).toBe(events.length);
});
