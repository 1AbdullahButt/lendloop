import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ADMIN,
  ALICE,
  BOB,
  CAROL,
  TODAY,
  addDays,
  countRows,
  createTool,
  eventsForLoan,
  expectConvexError,
  getLoan,
  getTool,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
} from "./_helpers";

useLendLoopEnv();

async function world() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const carol = await signIn(t, CAROL);
  const toolId = await createTool(alice.as, { name: "Pressure washer", category: "cleaning" });
  return { t, alice, bob, carol, toolId };
}

// ---------------------------------------------------------------------------
// AC6 / R1
// ---------------------------------------------------------------------------
describe("AC6: no self-borrowing", () => {
  test("AC6: requesting your own tool throws FORBIDDEN and writes nothing", async () => {
    const { t, alice, toolId } = await world();
    await expectConvexError(requestLoan(alice.as, toolId), "FORBIDDEN");
    expect(await countRows(t, "loans")).toBe(0);
    expect(await countRows(t, "automationEvents")).toBe(0);
  });

  test("AC6: another user can request the same tool", async () => {
    const { t, bob, alice, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId, addDays(TODAY, 2), addDays(TODAY, 4));
    expect(await getLoan(t, loanId)).toMatchObject({
      toolId,
      borrowerId: bob.id,
      lenderId: alice.id,
      startDate: addDays(TODAY, 2),
      endDate: addDays(TODAY, 4),
      status: "pending",
    });
    expect(typeof (await getLoan(t, loanId))!.createdAt).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// AC9 / R2 (today is pinned to 2026-11-06 UTC)
// ---------------------------------------------------------------------------
describe("AC9: date validation is server-side", () => {
  test("AC9: startDate before today (UTC) is INVALID", async () => {
    const { t, bob, toolId } = await world();
    await expectConvexError(requestLoan(bob.as, toolId, addDays(TODAY, -1), addDays(TODAY, 2)), "INVALID");
    expect(await countRows(t, "loans")).toBe(0);
  });

  test("AC9: endDate before startDate is INVALID", async () => {
    const { t, bob, toolId } = await world();
    await expectConvexError(requestLoan(bob.as, toolId, addDays(TODAY, 5), addDays(TODAY, 4)), "INVALID");
    expect(await countRows(t, "loans")).toBe(0);
  });

  test("AC9: a loan longer than 30 days is INVALID", async () => {
    const { t, bob, toolId } = await world();
    await expectConvexError(requestLoan(bob.as, toolId, TODAY, addDays(TODAY, 31)), "INVALID", "31 days after start");
    await expectConvexError(requestLoan(bob.as, toolId, TODAY, addDays(TODAY, 90)), "INVALID", "90 days after start");
    expect(await countRows(t, "loans")).toBe(0);
  });

  test("AC9: malformed dates are INVALID", async () => {
    const { t, bob, toolId } = await world();
    const end = addDays(TODAY, 3);
    for (const bad of ["not-a-date", "2026-13-01", "2027-02-30", "2026-11-6", "07/11/2026", ""]) {
      await expectConvexError(requestLoan(bob.as, toolId, bad, end), "INVALID", `startDate ${JSON.stringify(bad)}`);
      await expectConvexError(
        requestLoan(bob.as, toolId, addDays(TODAY, 1), bad),
        "INVALID",
        `endDate ${JSON.stringify(bad)}`,
      );
    }
    expect(await countRows(t, "loans")).toBe(0);
  });

  test("AC9: boundaries that are valid: same-day loan starting today, and a 30-calendar-day span", async () => {
    const { t, bob, toolId } = await world();
    await requestLoan(bob.as, toolId, TODAY, TODAY);
    // start + 29 days = 30 calendar days inclusive, valid under either reading of "30 days".
    await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 30));
    expect(await countRows(t, "loans")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// AC10 / R3
// ---------------------------------------------------------------------------
describe("AC10: overlapping approvals", () => {
  test("AC10: overlapping approval throws CONFLICT and leaves the second request pending", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const first = await requestLoan(bob.as, toolId, addDays(TODAY, 4), addDays(TODAY, 9));
    const second = await requestLoan(carol.as, toolId, addDays(TODAY, 8), addDays(TODAY, 14));
    await alice.as.mutation(api.loans.approve, { loanId: first });
    const eventsBefore = (await eventsForLoan(t, second)).length;

    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId: second }), "CONFLICT");
    expect((await getLoan(t, second))!.status).toBe("pending");
    expect((await eventsForLoan(t, second)).length).toBe(eventsBefore);
  });

  test("AC10: overlap is inclusive: a request starting on another loan's endDate conflicts", async () => {
    const { alice, bob, carol, toolId } = await world();
    const first = await requestLoan(bob.as, toolId, addDays(TODAY, 4), addDays(TODAY, 9));
    const touching = await requestLoan(carol.as, toolId, addDays(TODAY, 9), addDays(TODAY, 12));
    await alice.as.mutation(api.loans.approve, { loanId: first });
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId: touching }), "CONFLICT");
  });

  test("AC10: a fully contained range conflicts too", async () => {
    const { alice, bob, carol, toolId } = await world();
    const outer = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 20));
    const inner = await requestLoan(carol.as, toolId, addDays(TODAY, 5), addDays(TODAY, 6));
    await alice.as.mutation(api.loans.approve, { loanId: outer });
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId: inner }), "CONFLICT");
  });

  test("AC10: non-overlapping requests on the same tool can both be approved", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const first = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 3));
    const later = await requestLoan(carol.as, toolId, addDays(TODAY, 4), addDays(TODAY, 6));
    await alice.as.mutation(api.loans.approve, { loanId: first });
    await alice.as.mutation(api.loans.approve, { loanId: later });
    expect((await getLoan(t, first))!.status).toBe("approved");
    expect((await getLoan(t, later))!.status).toBe("approved");
  });

  test("AC10: many pending requests may overlap; only approved loans block", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const a = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 5));
    const b = await requestLoan(carol.as, toolId, addDays(TODAY, 2), addDays(TODAY, 6));
    // Declined, cancelled and returned loans do not block.
    await alice.as.mutation(api.loans.decline, { loanId: a });
    await alice.as.mutation(api.loans.approve, { loanId: b });
    await alice.as.mutation(api.loans.markReturned, { loanId: b });
    const c = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 5));
    const d = await requestLoan(carol.as, toolId, addDays(TODAY, 1), addDays(TODAY, 5));
    await carol.as.mutation(api.loans.cancel, { loanId: d });
    await alice.as.mutation(api.loans.approve, { loanId: c });
    expect((await getLoan(t, c))!.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// AC11 / R7
// ---------------------------------------------------------------------------
describe("AC11: only allowed status transitions", () => {
  test("AC11: pending -> approved sets decidedAt; pending -> declined sets decidedAt; pending -> cancelled", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const a = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    const b = await requestLoan(carol.as, toolId, addDays(TODAY, 3), addDays(TODAY, 4));
    const c = await requestLoan(carol.as, toolId, addDays(TODAY, 5), addDays(TODAY, 6));
    await alice.as.mutation(api.loans.approve, { loanId: a });
    await alice.as.mutation(api.loans.decline, { loanId: b });
    await carol.as.mutation(api.loans.cancel, { loanId: c });
    const [la, lb, lc] = [await getLoan(t, a), await getLoan(t, b), await getLoan(t, c)];
    expect(la!.status).toBe("approved");
    expect(typeof la!.decidedAt).toBe("number");
    expect(lb!.status).toBe("declined");
    expect(typeof lb!.decidedAt).toBe("number");
    expect(lc!.status).toBe("cancelled");
  });

  test("AC11: from approved, only returned is allowed (decline/cancel/approve again are INVALID)", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await alice.as.mutation(api.loans.approve, { loanId });
    const events = (await eventsForLoan(t, loanId)).length;
    await expectConvexError(alice.as.mutation(api.loans.decline, { loanId }), "INVALID", "approved -> declined");
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId }), "INVALID", "approved -> approved");
    await expectConvexError(bob.as.mutation(api.loans.cancel, { loanId }), "INVALID", "approved -> cancelled");
    expect((await getLoan(t, loanId))!.status).toBe("approved");
    expect((await eventsForLoan(t, loanId)).length).toBe(events);
  });

  test("AC11: pending cannot be marked returned", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await expectConvexError(alice.as.mutation(api.loans.markReturned, { loanId }), "INVALID");
    expect((await getLoan(t, loanId))!.status).toBe("pending");
  });

  test("AC11: declined is final", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await alice.as.mutation(api.loans.decline, { loanId });
    const events = (await eventsForLoan(t, loanId)).length;
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId }), "INVALID", "declined -> approved");
    await expectConvexError(alice.as.mutation(api.loans.decline, { loanId }), "INVALID", "declined -> declined");
    await expectConvexError(alice.as.mutation(api.loans.markReturned, { loanId }), "INVALID", "declined -> returned");
    await expectConvexError(bob.as.mutation(api.loans.cancel, { loanId }), "INVALID", "declined -> cancelled");
    expect((await getLoan(t, loanId))!.status).toBe("declined");
    expect((await eventsForLoan(t, loanId)).length).toBe(events);
  });

  test("AC11: cancelled is final", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await bob.as.mutation(api.loans.cancel, { loanId });
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId }), "INVALID", "cancelled -> approved");
    await expectConvexError(alice.as.mutation(api.loans.decline, { loanId }), "INVALID", "cancelled -> declined");
    await expectConvexError(alice.as.mutation(api.loans.markReturned, { loanId }), "INVALID", "cancelled -> returned");
    await expectConvexError(bob.as.mutation(api.loans.cancel, { loanId }), "INVALID", "cancelled -> cancelled");
    expect((await getLoan(t, loanId))!.status).toBe("cancelled");
  });

  test("AC11: returned is final", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await alice.as.mutation(api.loans.approve, { loanId });
    await alice.as.mutation(api.loans.markReturned, { loanId });
    const events = (await eventsForLoan(t, loanId)).length;
    await expectConvexError(alice.as.mutation(api.loans.markReturned, { loanId }), "INVALID", "returned -> returned");
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId }), "INVALID", "returned -> approved");
    await expectConvexError(alice.as.mutation(api.loans.decline, { loanId }), "INVALID", "returned -> declined");
    await expectConvexError(bob.as.mutation(api.loans.cancel, { loanId }), "INVALID", "returned -> cancelled");
    expect((await getLoan(t, loanId))!.status).toBe("returned");
    expect((await eventsForLoan(t, loanId)).length).toBe(events);
  });
});

// ---------------------------------------------------------------------------
// AC12 / R4 / R5
// ---------------------------------------------------------------------------
describe("AC12: mark returned makes the tool available", () => {
  test("AC12 (R4): approving sets the tool on_loan, whatever the start date", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId, addDays(TODAY, 10), addDays(TODAY, 12));
    await alice.as.mutation(api.loans.approve, { loanId });
    expect((await getTool(t, toolId))!.status).toBe("on_loan");
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("AC12 (R5): markReturned sets loan returned + returnedAt and tool available (back on the public list)", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await alice.as.mutation(api.loans.approve, { loanId });
    await alice.as.mutation(api.loans.markReturned, { loanId });
    const loan = await getLoan(t, loanId);
    expect(loan!.status).toBe("returned");
    expect(typeof loan!.returnedAt).toBe("number");
    expect((await getTool(t, toolId))!.status).toBe("available");
    expect((await t.query(api.tools.listPublic, {})).map((x) => x._id)).toEqual([toolId]);
  });
});

// ---------------------------------------------------------------------------
// R6: removed tools
// ---------------------------------------------------------------------------
describe("R6: removed tools", () => {
  test("R6: owner tools.remove soft-deletes, cancels pending requests and keeps history", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const p1 = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    const p2 = await requestLoan(carol.as, toolId, addDays(TODAY, 3), addDays(TODAY, 4));
    await alice.as.mutation(api.tools.remove, { toolId });
    const tool = await getTool(t, toolId);
    expect(tool).not.toBeNull();
    expect(typeof tool!.removedAt).toBe("number");
    expect((await getLoan(t, p1))!.status).toBe("cancelled");
    expect((await getLoan(t, p2))!.status).toBe("cancelled");
    expect((await bob.as.query(api.tools.list, {})).map((x) => x._id)).not.toContain(toolId);
  });

  test("R6: a removed tool cannot be requested (NOT_FOUND)", async () => {
    const { t, alice, bob, toolId } = await world();
    await alice.as.mutation(api.tools.remove, { toolId });
    await expectConvexError(requestLoan(bob.as, toolId), "NOT_FOUND");
    expect(await countRows(t, "loans")).toBe(0);
  });

  test("R6: an owner cannot delete a tool while it is on_loan (CONFLICT, nothing changes)", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const active = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    const pending = await requestLoan(carol.as, toolId, addDays(TODAY, 5), addDays(TODAY, 6));
    await alice.as.mutation(api.loans.approve, { loanId: active });
    const before = await getTool(t, toolId);
    await expectConvexError(alice.as.mutation(api.tools.remove, { toolId }), "CONFLICT");
    expect(await getTool(t, toolId)).toEqual(before);
    expect((await getLoan(t, pending))!.status).toBe("pending");
  });

  test("R6: admin removeListing works on an on_loan tool, cancels pending requests, the active loan stays returnable", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const admin = await signIn(t, ADMIN);
    const active = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    const pending = await requestLoan(carol.as, toolId, addDays(TODAY, 5), addDays(TODAY, 6));
    await alice.as.mutation(api.loans.approve, { loanId: active });

    await admin.as.mutation(api.admin.removeListing, { toolId });
    expect(typeof (await getTool(t, toolId))!.removedAt).toBe("number");
    expect((await getLoan(t, pending))!.status).toBe("cancelled");
    expect((await getLoan(t, active))!.status).toBe("approved");

    await alice.as.mutation(api.loans.markReturned, { loanId: active });
    expect((await getLoan(t, active))!.status).toBe("returned");
    // Still hidden from non-admin lists after it becomes available again.
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("R6: removed tools are hidden from listPublic, tools.list and the owner's listMine but visible to admin", async () => {
    const { t, alice, bob, toolId } = await world();
    const admin = await signIn(t, ADMIN);
    await admin.as.mutation(api.admin.removeListing, { toolId });
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
    expect(await bob.as.query(api.tools.list, {})).toEqual([]);
    expect(await alice.as.query(api.tools.listMine, {})).toEqual([]);
    const adminTools = await admin.as.query(api.admin.listTools, {});
    expect(adminTools.map((x) => x._id as Id<"tools">)).toContain(toolId);
  });
});
