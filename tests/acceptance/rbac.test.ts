import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { modules } from "../../convex/test.setup";
import {
  ADMIN,
  ALICE,
  BOB,
  CAROL,
  CONTRACT_PUBLIC,
  PUBLIC_WITHOUT_AUTH,
  callByPath,
  countRows,
  createTool,
  eventsForLoan,
  expectConvexError,
  getLoan,
  getTool,
  getUser,
  loadConvexFunctions,
  newTest,
  requestLoan,
  sampleArgs,
  seedOneOfEach,
  signIn,
  useLendLoopEnv,
  type ValidatorJson,
} from "./_helpers";

useLendLoopEnv();

// ---------------------------------------------------------------------------
// AC4
// ---------------------------------------------------------------------------
describe("AC4: unauthenticated calls", () => {
  test("AC4: every function in CONTRACT.md exists as a public function of the stated type", async () => {
    const fns = await loadConvexFunctions();
    for (const c of CONTRACT_PUBLIC) {
      const fn = fns.find((f) => f.path === c.path);
      expect(fn, `${c.path} is missing`).toBeDefined();
      expect(fn!.visibility, `${c.path} must be public`).toBe("public");
      expect(fn!.kind, `${c.path} must be a ${c.kind}`).toBe(c.kind);
    }
  });

  test("AC4: every public function except tools.listPublic throws UNAUTHENTICATED without identity", async () => {
    const t = newTest();
    const ids = await seedOneOfEach(t);
    const fns = (await loadConvexFunctions()).filter(
      (f) => f.visibility === "public" && !PUBLIC_WITHOUT_AUTH.has(f.path),
    );
    // Guard against an empty sweep passing vacuously.
    expect(fns.length).toBeGreaterThanOrEqual(CONTRACT_PUBLIC.length - PUBLIC_WITHOUT_AUTH.size);
    const before = {
      users: await countRows(t, "users"),
      tools: await countRows(t, "tools"),
      loans: await countRows(t, "loans"),
      automationEvents: await countRows(t, "automationEvents"),
    };
    for (const fn of fns) {
      await expectConvexError(callByPath(t, fn, sampleArgs(fn, ids)), "UNAUTHENTICATED", fn.path);
    }
    // Nothing was written by any rejected call.
    expect({
      users: await countRows(t, "users"),
      tools: await countRows(t, "tools"),
      loans: await countRows(t, "loans"),
      automationEvents: await countRows(t, "automationEvents"),
    }).toEqual(before);
  });

  test("AC4: queries with a valid identity but no users row throw UNAUTHENTICATED", async () => {
    const t = newTest();
    const ghost = t.withIdentity({ subject: "user_ghost", email: "ghost@example.com", name: "Ghost" });
    await expectConvexError(ghost.query(api.users.me, {}), "UNAUTHENTICATED", "users.me");
    await expectConvexError(ghost.query(api.tools.list, {}), "UNAUTHENTICATED", "tools.list");
    await expectConvexError(ghost.query(api.tools.listMine, {}), "UNAUTHENTICATED", "tools.listMine");
    await expectConvexError(ghost.query(api.loans.listMine, {}), "UNAUTHENTICATED", "loans.listMine");
    await expectConvexError(ghost.query(api.loans.listIncoming, {}), "UNAUTHENTICATED", "loans.listIncoming");
    await expectConvexError(ghost.query(api.admin.listAllLoans, {}), "UNAUTHENTICATED", "admin.listAllLoans");
  });

  test("AC4 (SPEC 3): a mutation with a valid identity but no users row creates the row with role user", async () => {
    const t = newTest();
    const carol = t.withIdentity(CAROL);
    const toolId = await createTool(carol);
    const tool = await getTool(t, toolId);
    const owner = await getUser(t, tool!.ownerId);
    expect(owner).toMatchObject({ clerkId: CAROL.subject, role: "user", trustedLender: false });
  });

  test("AC4: users.ensure creates the row once and returns it; users.me returns the caller", async () => {
    const t = newTest();
    const as = t.withIdentity(BOB);
    const first = await as.mutation(api.users.ensure, {});
    const second = await as.mutation(api.users.ensure, {});
    expect(second._id).toBe(first._id);
    expect(first).toMatchObject({
      clerkId: BOB.subject,
      email: BOB.email,
      name: BOB.name,
      role: "user",
      trustedLender: false,
    });
    expect(await countRows(t, "users")).toBe(1);
    const me = await as.query(api.users.me, {});
    expect(me).toMatchObject({ _id: first._id, role: "user" });
  });
});

// ---------------------------------------------------------------------------
// AC5
// ---------------------------------------------------------------------------
describe("AC5: ownership checks", () => {
  async function world() {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const bob = await signIn(t, BOB);
    const carol = await signIn(t, CAROL);
    const admin = await signIn(t, ADMIN);
    const toolId = await createTool(alice.as, { name: "Alice's ladder" });
    const loanId = await requestLoan(carol.as, toolId);
    return { t, alice, bob, carol, admin, toolId, loanId };
  }

  test("AC5: a user cannot edit another user's tool (FORBIDDEN, row unchanged, no data leak)", async () => {
    const { t, bob, toolId } = await world();
    const before = await getTool(t, toolId);
    const err = await expectConvexError(
      bob.as.mutation(api.tools.update, { toolId, name: "Mine now" }),
      "FORBIDDEN",
    );
    expect(JSON.stringify((err as { data?: unknown }).data)).not.toContain(ALICE.email);
    expect(await getTool(t, toolId)).toEqual(before);
  });

  test("AC5: a user cannot delete another user's tool (FORBIDDEN, row unchanged)", async () => {
    const { t, bob, toolId, loanId } = await world();
    const before = await getTool(t, toolId);
    await expectConvexError(bob.as.mutation(api.tools.remove, { toolId }), "FORBIDDEN");
    expect(await getTool(t, toolId)).toEqual(before);
    expect((await getLoan(t, loanId))!.status).toBe("pending");
  });

  test("AC5: an admin also cannot edit or delete someone else's tool through tools.* (uses admin.removeListing instead)", async () => {
    const { t, admin, toolId } = await world();
    const before = await getTool(t, toolId);
    await expectConvexError(admin.as.mutation(api.tools.update, { toolId, name: "Moderated" }), "FORBIDDEN");
    await expectConvexError(admin.as.mutation(api.tools.remove, { toolId }), "FORBIDDEN");
    expect(await getTool(t, toolId)).toEqual(before);
  });

  test("AC5: a user cannot approve or decline requests on another user's tool", async () => {
    const { t, bob, loanId } = await world();
    await expectConvexError(bob.as.mutation(api.loans.approve, { loanId }), "FORBIDDEN", "approve");
    await expectConvexError(bob.as.mutation(api.loans.decline, { loanId }), "FORBIDDEN", "decline");
    expect((await getLoan(t, loanId))!.status).toBe("pending");
  });

  test("AC5: the borrower cannot approve or decline their own request (only the lender can)", async () => {
    const { t, carol, loanId } = await world();
    await expectConvexError(carol.as.mutation(api.loans.approve, { loanId }), "FORBIDDEN", "approve");
    await expectConvexError(carol.as.mutation(api.loans.decline, { loanId }), "FORBIDDEN", "decline");
    expect((await getLoan(t, loanId))!.status).toBe("pending");
  });

  test("AC5: a user cannot mark returned a loan on another user's tool", async () => {
    const { t, alice, bob, carol, loanId } = await world();
    await alice.as.mutation(api.loans.approve, { loanId });
    await expectConvexError(bob.as.mutation(api.loans.markReturned, { loanId }), "FORBIDDEN", "stranger");
    await expectConvexError(carol.as.mutation(api.loans.markReturned, { loanId }), "FORBIDDEN", "borrower");
    expect((await getLoan(t, loanId))!.status).toBe("approved");
  });

  test("AC5: only the borrower can cancel their pending request", async () => {
    const { t, alice, bob, loanId } = await world();
    const eventsBefore = (await eventsForLoan(t, loanId)).length;
    await expectConvexError(bob.as.mutation(api.loans.cancel, { loanId }), "FORBIDDEN", "stranger");
    await expectConvexError(alice.as.mutation(api.loans.cancel, { loanId }), "FORBIDDEN", "lender");
    expect((await getLoan(t, loanId))!.status).toBe("pending");
    expect((await eventsForLoan(t, loanId)).length).toBe(eventsBefore);
  });

  test("AC5: listIncoming shows only requests on the caller's tools; listMine only the caller's requests", async () => {
    const { alice, bob, carol, loanId } = await world();
    expect((await alice.as.query(api.loans.listIncoming, {})).map((l) => l._id)).toEqual([loanId]);
    expect(await bob.as.query(api.loans.listIncoming, {})).toEqual([]);
    expect((await carol.as.query(api.loans.listMine, {})).map((l) => l._id)).toEqual([loanId]);
    expect(await bob.as.query(api.loans.listMine, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC7
// ---------------------------------------------------------------------------
describe("AC7: admin functions", () => {
  test("AC7: a plain user calling every public admin.* function gets FORBIDDEN", async () => {
    const t = newTest();
    const ids = await seedOneOfEach(t);
    const { as: bob } = await signIn(t, BOB);
    const adminFns = (await loadConvexFunctions()).filter((f) => f.module === "admin" && f.visibility === "public");
    expect(adminFns.length).toBeGreaterThanOrEqual(6);
    for (const fn of adminFns) {
      await expectConvexError(callByPath(bob, fn, sampleArgs(fn, ids)), "FORBIDDEN", fn.path);
    }
  });

  test("AC7: a plain user cannot remove a listing, list all loans or set Trusted Lender", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const bob = await signIn(t, BOB);
    const toolId = await createTool(alice.as);
    const loanId = await requestLoan(bob.as, toolId);

    await expectConvexError(bob.as.mutation(api.admin.removeListing, { toolId }), "FORBIDDEN", "removeListing");
    await expectConvexError(bob.as.query(api.admin.listAllLoans, {}), "FORBIDDEN", "listAllLoans");
    await expectConvexError(
      bob.as.mutation(api.admin.setTrustedLender, { userId: bob.id, trusted: true }),
      "FORBIDDEN",
      "setTrustedLender on self",
    );
    await expectConvexError(
      alice.as.mutation(api.admin.setTrustedLender, { userId: alice.id, trusted: true }),
      "FORBIDDEN",
      "setTrustedLender by owner",
    );
    expect((await getTool(t, toolId))!.removedAt).toBeUndefined();
    expect((await getLoan(t, loanId))!.status).toBe("pending");
    expect((await getUser(t, bob.id))!.trustedLender).toBe(false);
    expect((await getUser(t, alice.id))!.trustedLender).toBe(false);
  });

  test("AC7: an admin bootstrapped via ADMIN_EMAILS can use every admin function", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const bob = await signIn(t, BOB);
    const admin = await signIn(t, ADMIN);
    expect(admin.user.role).toBe("admin");

    const toolId = await createTool(alice.as);
    const other = await createTool(alice.as, { name: "Other" });
    const loanId = await requestLoan(bob.as, toolId);

    expect((await admin.as.query(api.admin.listAllLoans, {})).map((l) => l._id)).toContain(loanId);
    expect((await admin.as.query(api.admin.listUsers, {})).length).toBe(3);
    expect(Array.isArray(await admin.as.query(api.admin.listAutomationEvents, {}))).toBe(true);

    await admin.as.mutation(api.admin.setTrustedLender, { userId: alice.id, trusted: true });
    expect((await getUser(t, alice.id))!.trustedLender).toBe(true);
    await admin.as.mutation(api.admin.setTrustedLender, { userId: alice.id, trusted: false });
    expect((await getUser(t, alice.id))!.trustedLender).toBe(false);

    await admin.as.mutation(api.admin.removeListing, { toolId: other });
    expect(typeof (await getTool(t, other))!.removedAt).toBe("number");
    // Admin views still show removed tools.
    expect((await admin.as.query(api.admin.listTools, {})).map((x) => x._id)).toContain(other);
  });

  test("AC7: an admin bootstrapped via internal users.setRole (dashboard path) can use admin functions", async () => {
    const t = newTest();
    const carol = await signIn(t, CAROL);
    await expectConvexError(carol.as.query(api.admin.listAllLoans, {}), "FORBIDDEN");
    await t.mutation(internal.users.setRole, { userId: carol.id, role: "admin" });
    expect(Array.isArray(await carol.as.query(api.admin.listAllLoans, {}))).toBe(true);
    await t.mutation(internal.users.setRole, { userId: carol.id, role: "user" });
    await expectConvexError(carol.as.query(api.admin.listAllLoans, {}), "FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// AC8
// ---------------------------------------------------------------------------
function fieldNames(v: ValidatorJson): string[] {
  if (v.type === "object") {
    const fields = (v.value ?? {}) as Record<string, { fieldType: ValidatorJson }>;
    return Object.entries(fields).flatMap(([k, f]) => [k, ...fieldNames(f.fieldType)]);
  }
  if (v.type === "union" || v.type === "array") {
    const inner = v.value as ValidatorJson | ValidatorJson[];
    return (Array.isArray(inner) ? inner : [inner]).flatMap(fieldNames);
  }
  return [];
}

describe("AC8: role cannot be changed by any client-callable function", () => {
  test("AC8: every public function declares an args validator and none accepts a role argument", async () => {
    const pub = (await loadConvexFunctions()).filter((f) => f.visibility === "public");
    expect(pub.length).toBeGreaterThanOrEqual(CONTRACT_PUBLIC.length);
    for (const fn of pub) {
      expect(fn.args.type, `${fn.path} must declare args (strict validator)`).toBe("object");
      const names = fieldNames(fn.args).map((n) => n.toLowerCase());
      expect(names, `${fn.path} accepts a role-like argument`).not.toContain("role");
      expect(names, `${fn.path} accepts a role-like argument`).not.toContain("isadmin");
    }
  });

  test("AC8: users.setRole is internal, not in the client API", async () => {
    const load = modules["./users.ts"];
    expect(load, "convex/users.ts is missing").toBeDefined();
    const usersModule = (await load()) as Record<
      string,
      { isInternal?: boolean; isPublic?: boolean; isMutation?: boolean }
    >;
    expect(usersModule.setRole, "users.setRole must exist").toBeDefined();
    expect(usersModule.setRole.isInternal).toBe(true);
    expect(usersModule.setRole.isPublic).not.toBe(true);
    expect(usersModule.setRole.isMutation).toBe(true);
  });

  test("AC8: passing role to users.ensure is rejected and the role stays user", async () => {
    const t = newTest();
    const bob = await signIn(t, BOB);
    await expect(
      bob.as.mutation(api.users.ensure, { role: "admin" } as never),
    ).rejects.toThrow();
    expect((await getUser(t, bob.id))!.role).toBe("user");
  });

  test("AC8: role claims in the identity token (Clerk metadata) are ignored", async () => {
    const t = newTest();
    const sneaky = t.withIdentity({
      subject: "user_sneaky",
      email: "sneaky@example.com",
      name: "Sneaky",
      role: "admin",
      publicMetadata: { role: "admin" },
    });
    const user = await sneaky.mutation(api.users.ensure, {});
    expect(user.role).toBe("user");
    await expectConvexError(sneaky.query(api.admin.listAllLoans, {}), "FORBIDDEN");
  });

  test("AC8: users.ensure never changes role for a non-ADMIN_EMAILS user, however often it is called", async () => {
    const t = newTest();
    const as = t.withIdentity(BOB);
    for (let i = 0; i < 3; i++) {
      const u = await as.mutation(api.users.ensure, {});
      expect(u.role).toBe("user");
    }
  });

  test("AC8: ADMIN_EMAILS promotes but never demotes", async () => {
    const t = newTest();
    // Promote: an existing plain user whose email is in ADMIN_EMAILS becomes admin on the next ensure.
    const pre = await t.run((ctx) =>
      ctx.db.insert("users", {
        clerkId: ADMIN.subject,
        name: ADMIN.name,
        email: ADMIN.email,
        role: "user",
        trustedLender: false,
      }),
    );
    const promoted = await t.withIdentity(ADMIN).mutation(api.users.ensure, {});
    expect(promoted._id).toBe(pre);
    expect(promoted.role).toBe("admin");

    // Never demote: an admin (set via setRole) whose email is not in ADMIN_EMAILS stays admin.
    const carol = await signIn(t, CAROL);
    await t.mutation(internal.users.setRole, { userId: carol.id, role: "admin" });
    const again = await carol.as.mutation(api.users.ensure, {});
    expect(again.role).toBe("admin");
  });

  test("AC8: admin setTrustedLender changes only trustedLender, never role", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const admin = await signIn(t, ADMIN);
    await admin.as.mutation(api.admin.setTrustedLender, { userId: alice.id, trusted: true });
    expect(await getUser(t, alice.id)).toMatchObject({ role: "user", trustedLender: true });
  });
});
