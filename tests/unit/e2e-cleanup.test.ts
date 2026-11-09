// seed:cleanupRun undoes one e2e run for good: its test tools, every loan on them, the extra
// loans it made on real tools and all their emails are deleted; a real tool it lent goes back
// to available; real listings and their loans are untouched; nothing new is queued.
import { expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { ALICE, BOB, CAROL, addDays, TODAY, allEvents, createTool, newTest, requestLoan, signIn, useLendLoopEnv } from "../acceptance/_helpers";

useLendLoopEnv();

test("deletes the run's tools, loans and emails, frees the lent tool, keeps real data", async () => {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const carol = await signIn(t, CAROL);
  const qaDrill = await createTool(alice.as, { name: "QA drill abc123" });
  const spare = await createTool(alice.as, { name: "QA spare ladder abc123" });
  const mixer = await createTool(alice.as, { name: "Stand mixer" });
  const tent = await createTool(alice.as, { name: "Two-person tent" });
  const approved = await requestLoan(bob.as, qaDrill, addDays(TODAY, 1), addDays(TODAY, 2));
  const pending = await requestLoan(carol.as, qaDrill, addDays(TODAY, 5), addDays(TODAY, 6));
  await alice.as.mutation(api.loans.approve, { loanId: approved });
  // A loan on a real tool that the run created (like the seeded overdue loan).
  const extra = await requestLoan(bob.as, mixer, addDays(TODAY, 3), addDays(TODAY, 4));
  await alice.as.mutation(api.loans.approve, { loanId: extra });
  // Real data that must survive.
  const real = await requestLoan(carol.as, tent, addDays(TODAY, 3), addDays(TODAY, 4));
  const realEvents = (await allEvents(t)).filter((e) => e.loanId === real);
  expect(realEvents.length).toBeGreaterThan(0);

  const result = await t.mutation(internal.seed.cleanupRun, { toolIds: [qaDrill, spare], loanIds: [extra] });
  expect(result.toolsDeleted).toBe(2);
  expect(result.loansDeleted).toBe(3);
  expect(result.eventsDeleted).toBeGreaterThan(0);

  const get = <T,>(fn: (ctx: Parameters<Parameters<typeof t.run>[0]>[0]) => Promise<T>) => t.run(fn);
  for (const id of [approved, pending, extra]) expect(await get((ctx) => ctx.db.get(id))).toBeNull();
  for (const id of [qaDrill, spare]) expect(await get((ctx) => ctx.db.get(id))).toBeNull();
  expect((await get((ctx) => ctx.db.get(mixer)))?.status).toBe("available");
  expect((await get((ctx) => ctx.db.get(real)))?.status).toBe("pending");
  // Only the real loan's emails remain, and nothing new was queued.
  const after = await allEvents(t);
  expect(after.map((e) => e.loanId)).toEqual(realEvents.map((e) => e.loanId));
  expect((await t.query(api.tools.listPublic, {})).map((x) => x.name).sort()).toEqual(["Stand mixer", "Two-person tent"]);
});

test("refuses to delete a tool that isn't a test fixture", async () => {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const mixer = await createTool(alice.as, { name: "Stand mixer" });
  await expect(t.mutation(internal.seed.cleanupRun, { toolIds: [mixer], loanIds: [] })).rejects.toThrow(/Not a test tool/);
  expect(await t.run((ctx) => ctx.db.get(mixer))).not.toBeNull();
});
