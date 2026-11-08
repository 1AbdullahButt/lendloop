// "Dates taken": when a lender approves one request, every other borrower whose pending dates
// it newly covers gets one loan.dates_taken email (their request stays pending), shown on My
// requests, resendable only while the dates are still taken.
import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ADMIN,
  ALICE,
  BOB,
  CAROL,
  TODAY,
  addDays,
  allEvents,
  createTool,
  expectConvexError,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
  type TestInstance,
  type Who,
} from "../acceptance/_helpers";

useLendLoopEnv();

const DAVE: Who = { subject: "user_dave", email: "dave@example.com", name: "Dave Neighbor" };
const d = (n: number) => addDays(TODAY, n);

async function world() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const carol = await signIn(t, CAROL);
  const dave = await signIn(t, DAVE);
  const toolId = await createTool(alice.as);
  return { t, alice, bob, carol, dave, toolId };
}

const takenKeys = async (t: TestInstance, loanId: Id<"loans">) =>
  (await allEvents(t)).filter((e) => e.loanId === loanId && e.idempotencyKey.includes(":loan.dates_taken")).map((e) => e.idempotencyKey);

describe("loan.dates_taken on approve", () => {
  test("every other overlapping pending borrower is told once; requests stay pending", async () => {
    const { t, alice, bob, carol, dave, toolId } = await world();
    const b = await requestLoan(bob.as, toolId, d(2), d(4));
    const c = await requestLoan(carol.as, toolId, d(3), d(5));
    const e = await requestLoan(dave.as, toolId, d(4), d(9)); // touches only on d(4): inclusive
    const far = await requestLoan(dave.as, toolId, d(10), d(12)); // no overlap
    await alice.as.mutation(api.loans.approve, { loanId: b });

    expect(await takenKeys(t, c)).toEqual([`${c}:loan.dates_taken:${b}`]);
    expect(await takenKeys(t, e)).toEqual([`${e}:loan.dates_taken:${b}`]);
    expect(await takenKeys(t, far)).toEqual([]);
    expect(await takenKeys(t, b)).toEqual([]);
    for (const id of [c, e, far]) expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("pending");
  });

  test("the email goes to the blocked borrower only, with their own dates and the locked payload keys", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const b = await requestLoan(bob.as, toolId, d(2), d(4));
    const c = await requestLoan(carol.as, toolId, d(3), d(5));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await alice.as.mutation(api.loans.approve, { loanId: b });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body)) as Record<string, string>);
    const taken = bodies.find((x) => x.type === "loan.dates_taken")!;
    expect(Object.keys(taken).sort()).toEqual(
      ["endDate", "eventId", "loanId", "recipientEmail", "recipientName", "sentAt", "startDate", "toolName", "type"].sort(),
    );
    expect(taken).toMatchObject({ loanId: c, recipientEmail: CAROL.email, recipientName: CAROL.name, startDate: d(3), endDate: d(5) });
    expect(JSON.stringify(taken)).not.toContain(BOB.email);
    const [row] = (await allEvents(t)).filter((x) => x.idempotencyKey === `${c}:loan.dates_taken:${b}`);
    expect(row.status).toBe("sent");
  });

  test("approving a second loan that also covers an already-blocked request sends nothing new", async () => {
    const { t, alice, bob, carol, dave, toolId } = await world();
    const a = await requestLoan(bob.as, toolId, d(2), d(4));
    const b = await requestLoan(dave.as, toolId, d(5), d(7));
    const c = await requestLoan(carol.as, toolId, d(3), d(6)); // overlaps both
    await alice.as.mutation(api.loans.approve, { loanId: a });
    await alice.as.mutation(api.loans.approve, { loanId: b });
    expect(await takenKeys(t, c)).toEqual([`${c}:loan.dates_taken:${a}`]);
  });

  test("freed up, then taken by a different loan: told again; once free, the request can be approved", async () => {
    const { t, alice, bob, carol, dave, toolId } = await world();
    const a = await requestLoan(bob.as, toolId, d(2), d(4));
    const b = await requestLoan(dave.as, toolId, d(5), d(7));
    const c = await requestLoan(carol.as, toolId, d(3), d(6));
    await alice.as.mutation(api.loans.approve, { loanId: a });
    await alice.as.mutation(api.loans.markReturned, { loanId: a }); // dates free again
    await alice.as.mutation(api.loans.approve, { loanId: b });
    expect((await takenKeys(t, c)).sort()).toEqual([`${c}:loan.dates_taken:${a}`, `${c}:loan.dates_taken:${b}`].sort());
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId: c }), "CONFLICT");
    await alice.as.mutation(api.loans.markReturned, { loanId: b });
    await alice.as.mutation(api.loans.approve, { loanId: c });
  });

  test("declined, cancelled, stale and the approved borrower's own requests are not told", async () => {
    const { t, alice, bob, carol, dave, toolId } = await world();
    const declined = await requestLoan(carol.as, toolId, d(3), d(5));
    await alice.as.mutation(api.loans.decline, { loanId: declined });
    const cancelled = await requestLoan(dave.as, toolId, d(3), d(5));
    await dave.as.mutation(api.loans.cancel, { loanId: cancelled });
    const own = await requestLoan(bob.as, toolId, d(3), d(6));
    const stale = await requestLoan(carol.as, toolId, d(0), d(8));
    vi.setSystemTime(new Date(`${d(1)}T12:00:00Z`)); // stale's start has now passed
    const b = await requestLoan(bob.as, toolId, d(2), d(4));
    await alice.as.mutation(api.loans.approve, { loanId: b });
    for (const id of [declined, cancelled, own, stale]) expect(await takenKeys(t, id)).toEqual([]);
  });

  test("an approve that fails with CONFLICT queues nothing", async () => {
    const { t, alice, bob, carol, dave, toolId } = await world();
    const a = await requestLoan(bob.as, toolId, d(2), d(4));
    const c = await requestLoan(carol.as, toolId, d(3), d(5));
    const e = await requestLoan(dave.as, toolId, d(5), d(6));
    await alice.as.mutation(api.loans.approve, { loanId: a });
    const before = (await allEvents(t)).length;
    await expectConvexError(alice.as.mutation(api.loans.approve, { loanId: c }), "CONFLICT");
    expect((await allEvents(t)).length).toBe(before);
    expect(await takenKeys(t, e)).toEqual([]);
  });
});

describe("My requests and admin resend", () => {
  test("listMine flags taken dates (without who), and clears it once they free up", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const b = await requestLoan(bob.as, toolId, d(2), d(4));
    const c = await requestLoan(carol.as, toolId, d(3), d(5));
    await alice.as.mutation(api.loans.approve, { loanId: b });
    let mine = (await carol.as.query(api.loans.listMine, {})).find((l) => l._id === c)!;
    expect(mine.datesTaken).toEqual({ startDate: d(2), endDate: d(4), mine: false });
    expect(JSON.stringify(mine)).not.toContain("Bob");
    await alice.as.mutation(api.loans.markReturned, { loanId: b });
    mine = (await carol.as.query(api.loans.listMine, {})).find((l) => l._id === c)!;
    expect(mine.datesTaken).toBeNull();
    void t;
  });

  test("a failed dates-taken email can be resent while the dates are taken, not after", async () => {
    const { t, alice, bob, carol, toolId } = await world();
    const admin = await signIn(t, ADMIN);
    const b = await requestLoan(bob.as, toolId, d(2), d(4));
    const c = await requestLoan(carol.as, toolId, d(3), d(5));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await alice.as.mutation(api.loans.approve, { loanId: b });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const ev = (await allEvents(t)).find((e) => e.idempotencyKey === `${c}:loan.dates_taken:${b}`)!;
    expect(ev.status).toBe("failed");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    await admin.as.mutation(api.admin.resendEvent, { eventId: ev._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(ev._id)))?.status).toBe("sent");

    // Fail it again, free the dates: now it's out of date.
    await t.run((ctx) => ctx.db.patch(ev._id, { status: "failed" }));
    await alice.as.mutation(api.loans.markReturned, { loanId: b });
    await expectConvexError(admin.as.mutation(api.admin.resendEvent, { eventId: ev._id }), "CONFLICT");
  });
});
