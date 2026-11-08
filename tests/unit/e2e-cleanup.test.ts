// seed:cleanupRun undoes one e2e run: its tools leave the board, its loans are closed, the
// tools it lent go back to available, and no email is queued for any of it.
import { expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { ALICE, BOB, CAROL, addDays, TODAY, allEvents, createTool, newTest, requestLoan, signIn, useLendLoopEnv } from "../acceptance/_helpers";

useLendLoopEnv();

test("closes the run's loans, removes its tools, frees the lent tools, sends nothing", async () => {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const carol = await signIn(t, CAROL);
  const qaDrill = await createTool(alice.as, { name: "QA drill abc123" });
  const keep = await createTool(alice.as, { name: "Stand mixer" });
  const approved = await requestLoan(bob.as, qaDrill, addDays(TODAY, 1), addDays(TODAY, 2));
  const pending = await requestLoan(carol.as, qaDrill, addDays(TODAY, 5), addDays(TODAY, 6));
  await alice.as.mutation(api.loans.approve, { loanId: approved });
  // A loan on another tool that the run created (like the seeded overdue loan).
  const extra = await requestLoan(bob.as, keep, addDays(TODAY, 3), addDays(TODAY, 4));
  await alice.as.mutation(api.loans.approve, { loanId: extra });
  const eventsBefore = (await allEvents(t)).length;

  const result = await t.mutation(internal.seed.cleanupRun, { toolIds: [qaDrill], loanIds: [extra] });
  expect(result).toEqual({ loansClosed: 3, toolsRemoved: 1 });

  const get = <T,>(fn: (ctx: Parameters<Parameters<typeof t.run>[0]>[0]) => Promise<T>) => t.run(fn);
  expect((await get((ctx) => ctx.db.get(approved)))?.status).toBe("returned");
  expect((await get((ctx) => ctx.db.get(pending)))?.status).toBe("cancelled");
  expect((await get((ctx) => ctx.db.get(extra)))?.status).toBe("returned");
  const drill = await get((ctx) => ctx.db.get(qaDrill));
  expect(drill?.removedAt).toEqual(expect.any(Number));
  const mixer = await get((ctx) => ctx.db.get(keep));
  expect(mixer?.status).toBe("available");
  expect(mixer?.removedAt).toBeUndefined();
  expect((await allEvents(t)).length).toBe(eventsBefore);
  // Gone from the board.
  expect((await t.query(api.tools.listPublic, {})).map((x) => x.name)).toEqual(["Stand mixer"]);
});
