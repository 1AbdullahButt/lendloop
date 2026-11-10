// loans.request guards: one pending request per borrower, tool and dates (a double click sends
// one email), and at most REQUESTS_PER_HOUR requests per borrower in a rolling hour.
import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { REQUESTS_PER_HOUR } from "../../convex/loans";
import {
  ALICE,
  BOB,
  CAROL,
  TODAY,
  addDays,
  countRows,
  createTool,
  expectConvexError,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
} from "../acceptance/_helpers";

useLendLoopEnv();

async function world() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const carol = await signIn(t, CAROL);
  const toolId = await createTool(alice.as);
  return { t, alice, bob, carol, toolId };
}

describe("duplicate pending request", () => {
  test("the same borrower, tool and overlapping dates -> CONFLICT, nothing written", async () => {
    const { t, bob, toolId } = await world();
    await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 3));
    await expectConvexError(requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 3)), "CONFLICT", "same dates");
    await expectConvexError(requestLoan(bob.as, toolId, addDays(TODAY, 3), addDays(TODAY, 5)), "CONFLICT", "touching day");
    expect(await countRows(t, "loans")).toBe(1);
    expect(await countRows(t, "automationEvents")).toBe(1);
  });

  test("other dates, other borrowers and finished requests are not duplicates", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const first = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 3));
    await requestLoan(bob.as, toolId, addDays(TODAY, 4), addDays(TODAY, 5));
    await requestLoan(carol.as, toolId, addDays(TODAY, 1), addDays(TODAY, 3));
    await alice.as.mutation(api.loans.decline, { loanId: first });
    await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 3));
    expect(await countRows(t, "loans")).toBe(4);
  });
});

describe("per-user rate limit", () => {
  test(`request ${REQUESTS_PER_HOUR + 1} in an hour -> CONFLICT; another user and the next hour are fine`, async () => {
    const { t, bob, carol, toolId } = await world();
    for (let i = 0; i < REQUESTS_PER_HOUR; i++) {
      await requestLoan(bob.as, toolId, addDays(TODAY, i + 1), addDays(TODAY, i + 1));
    }
    const day = addDays(TODAY, REQUESTS_PER_HOUR + 1);
    await expectConvexError(requestLoan(bob.as, toolId, day, day), "CONFLICT");
    expect(await countRows(t, "loans")).toBe(REQUESTS_PER_HOUR);

    await requestLoan(carol.as, toolId, day, day);
    vi.advanceTimersByTime(60 * 60 * 1000 + 1000);
    await requestLoan(bob.as, toolId, day, day);
    expect(await countRows(t, "loans")).toBe(REQUESTS_PER_HOUR + 2);
  });

  test("rejected requests don't count toward the limit", async () => {
    const { t, bob, toolId } = await world();
    for (let i = 0; i < REQUESTS_PER_HOUR + 5; i++) {
      await expectConvexError(requestLoan(bob.as, toolId, addDays(TODAY, -1), TODAY), "INVALID");
    }
    await requestLoan(bob.as, toolId);
    expect(await countRows(t, "loans")).toBe(1);
  });
});
