import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ADMIN,
  ALICE,
  BOB,
  createTool,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
} from "./_helpers";

useLendLoopEnv();

describe("AC2: tools.listPublic projection", () => {
  test("AC2: callable without identity and returns [] when there are no tools", async () => {
    const t = newTest();
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("AC2: each item has keys exactly _id, name, category", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const toolId = await createTool(alice, {
      name: "Hedge trimmer",
      category: "garden",
      condition: "fair",
      description: "Petrol, needs a pull start",
    });

    const list = await t.query(api.tools.listPublic, {});
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["_id", "category", "name"]);
    expect(list[0]).toEqual({ _id: toolId, name: "Hedge trimmer", category: "garden" });
    // No owner identity of any kind leaks into the public payload.
    const raw = JSON.stringify(list);
    expect(raw).not.toContain(ALICE.email);
    expect(raw).not.toContain(ALICE.name);
  });

  test("AC2: excludes on_loan tools, owner-removed tools and admin-removed tools", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const { as: bob } = await signIn(t, BOB);
    const { as: admin } = await signIn(t, ADMIN);

    const available = await createTool(alice, { name: "Available saw" });
    const onLoan = await createTool(alice, { name: "Borrowed sander" });
    const ownerRemoved = await createTool(alice, { name: "Owner removed rake" });
    const adminRemoved = await createTool(alice, { name: "Admin removed tent" });

    const loanId = await requestLoan(bob, onLoan);
    await alice.mutation(api.loans.approve, { loanId });
    await alice.mutation(api.tools.remove, { toolId: ownerRemoved });
    await admin.mutation(api.admin.removeListing, { toolId: adminRemoved });

    const list = await t.query(api.tools.listPublic, {});
    expect(list.map((x) => x._id)).toEqual([available]);
    for (const item of list) expect(Object.keys(item).sort()).toEqual(["_id", "category", "name"]);
  });

  test("AC2: signed-in callers get the same projection (no extra fields for users)", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    await createTool(alice);
    const asGuest = await t.query(api.tools.listPublic, {});
    const asAlice = await alice.query(api.tools.listPublic, {});
    expect(asAlice).toEqual(asGuest);
    expect(Object.keys(asAlice[0]).sort()).toEqual(["_id", "category", "name"]);
  });

  test("AC2: an identity without a users row can still call listPublic", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    await createTool(alice);
    const fresh = t.withIdentity({ subject: "user_new", email: "new@example.com", name: "New Person" });
    expect(await fresh.query(api.tools.listPublic, {})).toHaveLength(1);
  });
});

describe("AC2 (signed-in list): tools.list shows details but never owner email", () => {
  test("AC2: tools.list includes status, ownerName and ownerTrusted; hides removed tools and emails", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const { as: bob } = await signIn(t, BOB);
    const { as: admin } = await signIn(t, ADMIN);

    const drill = await createTool(alice, { name: "Drill", category: "power_tools" });
    const tent = await createTool(alice, { name: "Tent", category: "camping" });
    const gone = await createTool(alice, { name: "Gone", category: "garden" });
    const loanId = await requestLoan(bob, tent);
    await alice.mutation(api.loans.approve, { loanId });
    await admin.mutation(api.admin.removeListing, { toolId: gone });

    const list = await bob.query(api.tools.list, {});
    const ids = list.map((x) => x._id);
    expect(ids).toContain(drill);
    expect(ids).toContain(tent);
    expect(ids).not.toContain(gone);

    const tentRow = list.find((x) => x._id === tent)!;
    expect(tentRow.status).toBe("on_loan");
    // Other users' names leave Convex as first name + last initial (data minimisation; see qa/TEST-DISPUTES.md).
    expect(tentRow.ownerName).toBe("Alice L.");
    expect(tentRow.ownerTrusted).toBe(false);
    expect(list.find((x) => x._id === drill)!.status).toBe("available");

    const raw = JSON.stringify(list);
    expect(raw).not.toContain(ALICE.email);
    expect(raw).not.toMatch(/"ownerEmail"|"email"/);
  });

  test("AC2: tools.list category filter returns only that category", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const { as: bob } = await signIn(t, BOB);
    const rake = await createTool(alice, { name: "Rake", category: "garden" });
    await createTool(alice, { name: "Wok", category: "kitchen" });

    const garden = await bob.query(api.tools.list, { category: "garden" });
    expect(garden.map((x) => x._id)).toEqual([rake]);
    const all = await bob.query(api.tools.list, {});
    expect(all).toHaveLength(2);
  });

  test("AC2: ownerTrusted reflects the admin Trusted Lender flag", async () => {
    const t = newTest();
    const { as: alice, id: aliceId } = await signIn(t, ALICE);
    const { as: bob } = await signIn(t, BOB);
    const { as: admin } = await signIn(t, ADMIN);
    const toolId = await createTool(alice);

    await admin.mutation(api.admin.setTrustedLender, { userId: aliceId, trusted: true });
    const row = (await bob.query(api.tools.list, {})).find((x) => x._id === toolId)!;
    expect(row.ownerTrusted).toBe(true);
  });

  test("AC2: tools.listMine returns only the caller's non-removed tools", async () => {
    const t = newTest();
    const { as: alice } = await signIn(t, ALICE);
    const { as: bob } = await signIn(t, BOB);
    const mine = await createTool(alice, { name: "Mine" });
    const removed = await createTool(alice, { name: "Removed" });
    await createTool(bob, { name: "Bob's" });
    await alice.mutation(api.tools.remove, { toolId: removed });

    const list = await alice.query(api.tools.listMine, {});
    expect(list.map((x) => x._id)).toEqual([mine]);
  });
});
