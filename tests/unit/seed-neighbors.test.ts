// seed:neighbors links seed rows to real Clerk ids without ever giving two rows the same
// clerkId (QA L22), gives Ben C. the design's three tools without touching his own, and
// running it again adds nothing.
import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { ADMIN, createTool, newTest, signIn, useLendLoopEnv, type Who } from "../acceptance/_helpers";

useLendLoopEnv();

const OLIVIA: Who = { subject: "user_olivia_clerk", email: "olivia+clerk_test@example.com", name: "Olivia Parker" };
const BEN: Who = { subject: "user_ben_clerk", email: "ben+clerk_test@example.com", name: "Ben Carter" };
const BEN_TOOLS = ["Cordless drill", "Hedge trimmer", "Pressure washer"];

async function rows(t: ReturnType<typeof newTest>) {
  return await t.run(async (ctx) => ({
    users: await ctx.db.query("users").collect(),
    tools: await ctx.db.query("tools").collect(),
  }));
}

describe("seed:neighbors", () => {
  test("creates Ben with three tools and three neighbors with two each; a second run adds nothing", async () => {
    const t = newTest();
    expect(await t.mutation(internal.seed.neighbors, {})).toEqual({ people: 4, tools: 9, added: 9, skipped: 0 });
    expect(await t.mutation(internal.seed.neighbors, {})).toEqual({ people: 4, tools: 9, added: 0, skipped: 9 });
    const { users, tools } = await rows(t);
    expect(users.map((u) => u.name).sort()).toEqual(["Ben Carter", "Jake Thompson", "Marcus Davis", "Olivia Parker"]);
    expect(users.every((u) => u.email.endsWith("@example.com"))).toBe(true);
    expect(tools).toHaveLength(9);
  });

  test("Ben's tools match the design and go to his signed-in row; his own (e2e) tools are untouched", async () => {
    const t = newTest();
    const ben = await signIn(t, BEN);
    // Tools Ben listed himself, as the e2e run does, including one with a seed name in another case.
    const qaDrill = await createTool(ben.as, { name: "QA drill k3x9", category: "power_tools", description: "e2e" });
    await createTool(ben.as, { name: "cordless DRILL", category: "power_tools", description: "his own" });
    const before = await t.run((ctx) => ctx.db.get(qaDrill));

    await t.mutation(internal.seed.neighbors, { clerkIds: { ben: BEN.subject } });
    await t.mutation(internal.seed.neighbors, {});

    const { users, tools } = await rows(t);
    expect(users.filter((u) => u.email === BEN.email)).toHaveLength(1);
    const mine = tools.filter((x) => x.ownerId === ben.id);
    // "cordless DRILL" already existed, so the seed skipped its Cordless drill: no duplicate.
    expect(mine.map((x) => x.name).sort()).toEqual(["Hedge trimmer", "Pressure washer", "QA drill k3x9", "cordless DRILL"]);
    expect(await t.run((ctx) => ctx.db.get(qaDrill))).toEqual(before);
    expect(mine.find((x) => x.name === "Hedge trimmer")).toMatchObject({
      category: "garden",
      condition: "good",
      description: "Corded, comes with a 50 ft extension cord.",
      status: "available",
    });
    expect(mine.find((x) => x.name === "Pressure washer")).toMatchObject({ category: "cleaning", condition: "fair", description: "" });
  });

  test("seeded before Ben signs in: his sign-in gets the seeded row and all three tools", async () => {
    const t = newTest();
    await t.mutation(internal.seed.neighbors, { clerkIds: { ben: BEN.subject } });
    const ben = await signIn(t, BEN);
    const mine = await ben.as.query(api.tools.listMine, {});
    expect(mine.map((x) => x.name).sort()).toEqual(BEN_TOOLS);
    expect(mine.find((x) => x.name === "Cordless drill")).toMatchObject({
      category: "power_tools",
      condition: "good",
      description: "18V, two batteries and a charger. Bits are in the case.",
    });
  });

  test("a seed tool an admin removed stays removed: re-running neither restores nor duplicates it", async () => {
    const t = newTest();
    const admin = await signIn(t, ADMIN);
    await t.mutation(internal.seed.neighbors, {});
    const trimmer = (await rows(t)).tools.find((x) => x.name === "Hedge trimmer")!;
    await admin.as.mutation(api.admin.removeListing, { toolId: trimmer._id });

    expect(await t.mutation(internal.seed.neighbors, {})).toMatchObject({ added: 0 });
    const trimmers = (await rows(t)).tools.filter((x) => x.name === "Hedge trimmer");
    expect(trimmers).toHaveLength(1);
    expect(trimmers[0].removedAt).toEqual(expect.any(Number));
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
    expect(tools).toHaveLength(9);
    // The emptied placeholder is gone, so admins see one Olivia.
    expect(users.filter((u) => u.email === OLIVIA.email)).toHaveLength(1);

    // Later runs without ids land on the real row too (QA L26): no new tools, and the
    // overdue fixture lends the real Olivia's stand mixer.
    await t.mutation(internal.seed.neighbors, {});
    const { loanId } = await t.mutation(internal.seed.overdueLoan, {});
    const after = await rows(t);
    expect(after.tools).toHaveLength(9);
    expect(after.users.filter((u) => u.email === OLIVIA.email)).toHaveLength(1);
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.lenderId).toBe(olivia.id);
  });
});
