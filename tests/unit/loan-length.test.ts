// A loan lasts at most 30 calendar days counting the first and last day, on the server and in
// the form's helpers alike (Nov 15–Dec 14 is fine, Nov 15–Dec 15 is 31 days and is refused).
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { MAX_LOAN_DAYS as SERVER_MAX } from "../../convex/loans";
import { lastAllowedEnd, loanLength, MAX_LOAN_DAYS } from "../../lib/dates";
import { ALICE, BOB, TODAY, addDays, createTool, expectConvexError, newTest, signIn, useLendLoopEnv } from "../acceptance/_helpers";

useLendLoopEnv();

describe("30 days, counting both ends", () => {
  test("the form and the server share the same number", () => {
    expect(MAX_LOAN_DAYS).toBe(30);
    expect(SERVER_MAX).toBe(30);
  });

  test("helpers count inclusively and stop at day 30", () => {
    expect(loanLength("2026-11-07", "2026-11-09")).toBe(3);
    expect(loanLength("2026-11-15", "2026-11-15")).toBe(1);
    expect(loanLength("2026-11-15", "2026-12-14")).toBe(30);
    expect(loanLength("2026-11-15", "2026-12-15")).toBe(31);
    expect(lastAllowedEnd("2026-11-15")).toBe("2026-12-14");
  });

  test("server: start + 29 (30 days) is accepted, start + 30 (31 days) is refused", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const bob = await signIn(t, BOB);
    const toolId = await createTool(alice.as);
    await bob.as.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: addDays(TODAY, 29) });
    const err = await expectConvexError(
      bob.as.mutation(api.loans.request, { toolId, startDate: TODAY, endDate: addDays(TODAY, 30) }),
      "INVALID",
    );
    expect(String((err as { data?: { message?: string } }).data?.message ?? err)).toMatch(/30 days, counting the first and last day/);
  });
});
