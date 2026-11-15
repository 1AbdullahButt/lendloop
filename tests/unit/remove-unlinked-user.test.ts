// seed:removeUnlinkedUser deletes only a user row that nothing points at, so retiring an old
// admin can't orphan a tool or a loan.
import { expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ALICE, BOB, CAROL, createTool, expectConvexError, newTest, requestLoan, signIn, useLendLoopEnv, type TestInstance } from "../acceptance/_helpers";

useLendLoopEnv();

const rowOf = (t: TestInstance, clerkId: string) =>
  t.run(async (ctx) => (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId)).first())!._id);

test("an unlinked user is deleted", async () => {
  const t = newTest();
  await signIn(t, CAROL);
  const carol = await rowOf(t, CAROL.subject);
  expect(await t.mutation(internal.seed.removeUnlinkedUser, { userId: carol })).toEqual({ deleted: true });
  expect(await t.run((ctx) => ctx.db.get(carol))).toBeNull();
});

test("a tool owner, a borrower and a lender are refused with CONFLICT and kept", async () => {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  await signIn(t, CAROL);
  await requestLoan(bob.as, await createTool(alice.as));
  const carolTool = await signIn(t, CAROL).then((c) => createTool(c.as, { name: "Ladder" }));
  void carolTool;
  for (const who of [ALICE.subject, BOB.subject, CAROL.subject]) {
    const id: Id<"users"> = await rowOf(t, who);
    await expectConvexError(t.mutation(internal.seed.removeUnlinkedUser, { userId: id }), "CONFLICT");
    expect(await t.run((ctx) => ctx.db.get(id))).not.toBeNull();
  }
});
