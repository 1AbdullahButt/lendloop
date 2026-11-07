// seed:neighbors links seed rows to real Clerk ids without ever giving two rows the same
// clerkId (QA L22), and running it again adds nothing.
import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { newTest, signIn, useLendLoopEnv, type Who } from "../acceptance/_helpers";

useLendLoopEnv();

const OLIVIA: Who = { subject: "user_olivia_clerk", email: "olivia+clerk_test@example.com", name: "Olivia Parker" };

async function rows(t: ReturnType<typeof newTest>) {
  return await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    tools: await ctx.db.query("tools").collect(),
  }));
}

describe("seed:neighbors", () => {
  test("creates three neighbors with two tools each, and a second run adds nothing", async () => {
    const t = newTest();
    await t.mutation(internal.seed.neighbors, {});
    await t.mutation(internal.seed.neighbors, {});
    const { users, tools } = await rows(t);
    expect(users.map((u) => u.name).sort()).toEqual(["Jake Thompson", "Marcus Davis", "Olivia Parker"]);
    expect(users.every((u) => u.email.endsWith("@example.com"))).toBe(true);
    expect(tools).toHaveLength(6);
  });

  test("seeded first, signed in later: the sign-in reuses the seeded row", async () => {
    const t = newTest();
    await t.mutation(internal.seed.neighbors, { clerkIds: { olivia: OLIVIA.subject } });
    const olivia = await signIn(t, OLIVIA);
    const { users, tools } = await rows(t);
    expect(users.filter((u) => u.email === OLIVIA.email)).toHaveLength(1);
    expect(tools.filter((x) => x.ownerId === olivia.id)).toHaveLength(2);
  });

  test("placeholder row plus a real sign-in: never two rows with one clerkId", async () => {
    const t = newTest();
    await t.mutation(internal.seed.neighbors, {}); // placeholder seed_olivia
    const olivia = await signIn(t, OLIVIA); // real row, new clerkId
    await t.mutation(internal.seed.neighbors, { clerkIds: { olivia: OLIVIA.subject } });

    const { users, tools } = await rows(t);
    expect(users.filter((u) => u.clerkId === OLIVIA.subject)).toHaveLength(1);
    // users.me looks the caller up by clerkId with unique(); it must still work.
    expect((await olivia.as.query(api.users.me, {}))._id).toBe(olivia.id);
    // The placeholder's loan-free tools moved to the real row: no duplicates on the board.
    expect(tools.filter((x) => x.ownerId === olivia.id).map((x) => x.name).sort()).toEqual(["Ladder, 6 ft", "Stand mixer"]);
    expect(tools).toHaveLength(6);
    // The emptied placeholder is gone, so admins see one Olivia.
    expect(users.filter((u) => u.email === OLIVIA.email)).toHaveLength(1);

    // Later runs without ids land on the real row too (QA L26): no new tools, and the
    // overdue fixture lends the real Olivia's stand mixer.
    await t.mutation(internal.seed.neighbors, {});
    const { loanId } = await t.mutation(internal.seed.overdueLoan, {});
    const after = await rows(t);
    expect(after.tools).toHaveLength(6);
    expect(after.users.filter((u) => u.email === OLIVIA.email)).toHaveLength(1);
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.lenderId).toBe(olivia.id);
  });
});
