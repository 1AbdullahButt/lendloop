import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { verify } from "../../convex/lib/hmac";
import {
  ADMIN,
  ALICE,
  BOB,
  CAROL,
  CONVEX_TO_N8N_SECRET,
  TODAY,
  WEBHOOK_URL,
  addDays,
  allEvents,
  createTool,
  deliverJobs,
  eventsByKey,
  eventsForLoan,
  newTest,
  referenceSign,
  requestLoan,
  signIn,
  signedHeaders,
  useLendLoopEnv,
  type TestInstance,
} from "./_helpers";

useLendLoopEnv();

const PAYLOAD_KEYS = [
  "eventId",
  "type",
  "loanId",
  "toolName",
  "recipientName",
  "recipientEmail",
  "startDate",
  "endDate",
  "sentAt",
].sort();

type Captured = { url: string; method: string; headers: Headers; raw: string };

/** Replaces fetch with a recorder; `respond` decides each outcome. */
function captureFetch(respond: (n: number) => Promise<Response> | Response = () => new Response("ok", { status: 200 })) {
  const calls: Captured[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, method: req.method, headers: req.headers, raw: await req.text() });
    return await respond(calls.length);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

async function drain(t: TestInstance) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function world() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const toolId = await createTool(alice.as, { name: "Camping stove", category: "camping" });
  return { t, alice, bob, toolId };
}

// ---------------------------------------------------------------------------
// AC13
// ---------------------------------------------------------------------------
describe("AC13: one queued event + one scheduled action per loan change", () => {
  async function expectOneNewEvent(
    t: TestInstance,
    loanId: Id<"loans">,
    type: string,
    prevEvents: number,
    prevJobs: number,
  ) {
    const events = await eventsForLoan(t, loanId);
    expect(events, `events after ${type}`).toHaveLength(prevEvents + 1);
    const ev = events.find((e) => e.idempotencyKey === `${loanId}:${type}`);
    expect(ev, `event with key ${loanId}:${type}`).toBeDefined();
    expect(ev).toMatchObject({ loanId, kind: "request_notification", status: "queued" });
    expect(typeof ev!.createdAt).toBe("number");
    expect(await eventsByKey(t, `${loanId}:${type}`)).toHaveLength(1);

    const jobs = await deliverJobs(t);
    expect(jobs, `deliver jobs after ${type}`).toHaveLength(prevJobs + 1);
    const job = jobs[jobs.length - 1];
    expect(job.args[0]).toEqual({ eventId: ev!._id });
    expect(job.state.kind).toBe("pending");
    // runAfter(0): due now, not later.
    expect(job.scheduledTime).toBeLessThanOrEqual(Date.now() + 1000);
    return ev!;
  }

  test("AC13: loans.request queues exactly one loan.requested event and schedules automation.deliver", async () => {
    const { t, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await expectOneNewEvent(t, loanId, "loan.requested", 0, 0);
  });

  test("AC13: approve and markReturned each queue exactly one event and one action", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await alice.as.mutation(api.loans.approve, { loanId });
    await expectOneNewEvent(t, loanId, "loan.approved", 1, 1);
    await alice.as.mutation(api.loans.markReturned, { loanId });
    await expectOneNewEvent(t, loanId, "loan.returned", 2, 2);
  });

  test("AC13: decline queues exactly one loan.declined event", async () => {
    const { t, alice, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await alice.as.mutation(api.loans.decline, { loanId });
    await expectOneNewEvent(t, loanId, "loan.declined", 1, 1);
  });

  test("AC13: borrower cancel queues exactly one loan.cancelled event", async () => {
    const { t, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await bob.as.mutation(api.loans.cancel, { loanId });
    await expectOneNewEvent(t, loanId, "loan.cancelled", 1, 1);
  });

  test("AC13: removing a tool queues one loan.cancelled event per cancelled pending request", async () => {
    const { t, alice, bob, toolId } = await world();
    const carol = await signIn(t, CAROL);
    const l1 = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    const l2 = await requestLoan(carol.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    await alice.as.mutation(api.tools.remove, { toolId });
    for (const loanId of [l1, l2]) {
      const keys = (await eventsForLoan(t, loanId)).map((e) => e.idempotencyKey).sort();
      expect(keys).toEqual([`${loanId}:loan.cancelled`, `${loanId}:loan.requested`]);
    }
    expect(await deliverJobs(t)).toHaveLength(4);
  });

  test("AC13: tool create/update and rejected loan calls queue nothing", async () => {
    const { t, alice, bob, toolId } = await world();
    await alice.as.mutation(api.tools.update, { toolId, description: "Two burners" });
    await expect(requestLoan(alice.as, toolId)).rejects.toThrow();
    await expect(requestLoan(bob.as, toolId, addDays(TODAY, -3), TODAY)).rejects.toThrow();
    expect(await allEvents(t)).toEqual([]);
    expect(await deliverJobs(t)).toEqual([]);
  });

  test("AC13: mutations never call fetch themselves", async () => {
    const { t, alice, bob, toolId } = await world();
    const { mock } = captureFetch();
    const loanId = await requestLoan(bob.as, toolId);
    await alice.as.mutation(api.loans.approve, { loanId });
    await alice.as.mutation(api.loans.markReturned, { loanId });
    expect(mock).not.toHaveBeenCalled();
    await drain(t);
    expect(mock).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// AC14
// ---------------------------------------------------------------------------
describe("AC14: outbound payload and signature", () => {
  test("AC14: delivery POSTs exactly the SPEC 6.1 fields with a valid HMAC signature, then marks the event sent", async () => {
    const { t, bob, toolId } = await world();
    const { calls } = captureFetch();
    const start = addDays(TODAY, 2);
    const end = addDays(TODAY, 5);
    const loanId = await requestLoan(bob.as, toolId, start, end);
    const [queued] = await eventsForLoan(t, loanId);
    await drain(t);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toBe(WEBHOOK_URL);
    expect(call.method).toBe("POST");
    expect(call.headers.get("content-type") ?? "").toMatch(/application\/json/);

    const body = JSON.parse(call.raw) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(PAYLOAD_KEYS);
    expect(body).toEqual({
      eventId: queued._id,
      type: "loan.requested",
      loanId,
      toolName: "Camping stove",
      recipientName: ALICE.name,
      recipientEmail: ALICE.email,
      startDate: start,
      endDate: end,
      sentAt: body.sentAt,
    });
    expect(typeof body.sentAt).toBe("number");
    // Only the recipient's contact: never the other party's email.
    expect(call.raw).not.toContain(BOB.email);

    const ts = call.headers.get("X-LendLoop-Timestamp");
    const sig = call.headers.get("X-LendLoop-Signature");
    expect(ts).toMatch(/^\d{13}$/);
    expect(Math.abs(Number(ts) - Date.now())).toBeLessThan(5 * 60 * 1000);
    expect(sig).toBe(await referenceSign(CONVEX_TO_N8N_SECRET, ts!, call.raw));
    expect(await verify(CONVEX_TO_N8N_SECRET, ts!, call.raw, sig!, Date.now())).toBe(true);
    expect(await verify("wrong-secret", ts!, call.raw, sig!, Date.now())).toBe(false);

    const [sent] = await eventsForLoan(t, loanId);
    expect(sent.status).toBe("sent");
    expect(sent.attempts).toBe(1);
    expect(typeof sent.sentAt).toBe("number");
    expect(sent.lastError).toBeUndefined();
  });

  test("AC14: recipient is the party who did not act (requested->lender, approved/declined/returned->borrower)", async () => {
    const { t, alice, bob, toolId } = await world();
    const carol = await signIn(t, CAROL);
    const { calls } = captureFetch();

    const l1 = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    await alice.as.mutation(api.loans.approve, { loanId: l1 });
    await alice.as.mutation(api.loans.markReturned, { loanId: l1 });
    const l2 = await requestLoan(carol.as, toolId, addDays(TODAY, 3), addDays(TODAY, 4));
    await alice.as.mutation(api.loans.decline, { loanId: l2 });
    await drain(t);

    const seen = calls.map((c) => JSON.parse(c.raw) as { type: string; loanId: string; recipientEmail: string; recipientName: string });
    const pick = (loanId: string, type: string) => seen.find((p) => p.loanId === loanId && p.type === type);
    expect(pick(l1, "loan.requested")).toMatchObject({ recipientEmail: ALICE.email, recipientName: ALICE.name });
    expect(pick(l1, "loan.approved")).toMatchObject({ recipientEmail: BOB.email, recipientName: BOB.name });
    expect(pick(l1, "loan.returned")).toMatchObject({ recipientEmail: BOB.email, recipientName: BOB.name });
    expect(pick(l2, "loan.requested")).toMatchObject({ recipientEmail: ALICE.email });
    expect(pick(l2, "loan.declined")).toMatchObject({ recipientEmail: CAROL.email, recipientName: CAROL.name });
    expect(calls).toHaveLength(5);
    for (const c of calls) {
      const p = JSON.parse(c.raw) as Record<string, unknown>;
      expect(Object.keys(p).sort()).toEqual(PAYLOAD_KEYS);
      // Exactly one email address in the whole body.
      expect(c.raw.match(/@example\.com/g)).toHaveLength(1);
    }
  });

  test("AC14: cancelled by the borrower -> lender; cancelled by admin removal or owner removal -> borrower", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const bob = await signIn(t, BOB);
    const admin = await signIn(t, ADMIN);
    const { calls } = captureFetch();

    const t1 = await createTool(alice.as, { name: "Tool one" });
    const t2 = await createTool(alice.as, { name: "Tool two" });
    const t3 = await createTool(alice.as, { name: "Tool three" });
    const byBorrower = await requestLoan(bob.as, t1);
    await bob.as.mutation(api.loans.cancel, { loanId: byBorrower });
    const byAdmin = await requestLoan(bob.as, t2);
    await admin.as.mutation(api.admin.removeListing, { toolId: t2 });
    const byOwner = await requestLoan(bob.as, t3);
    await alice.as.mutation(api.tools.remove, { toolId: t3 });
    await drain(t);

    const cancelled = calls
      .map((c) => JSON.parse(c.raw) as { type: string; loanId: string; recipientEmail: string })
      .filter((p) => p.type === "loan.cancelled");
    expect(cancelled.find((p) => p.loanId === byBorrower)?.recipientEmail).toBe(ALICE.email);
    expect(cancelled.find((p) => p.loanId === byAdmin)?.recipientEmail).toBe(BOB.email);
    expect(cancelled.find((p) => p.loanId === byOwner)?.recipientEmail).toBe(BOB.email);
  });
});

// ---------------------------------------------------------------------------
// AC17
// ---------------------------------------------------------------------------
describe("AC17: retries then failed in the admin view", () => {
  test("AC17: network failure -> 1 attempt + 3 retries at 30s, 2m, 10m, then failed with lastError", async () => {
    const { t, bob, toolId } = await world();
    const admin = await signIn(t, ADMIN);
    const { calls } = captureFetch(() => {
      throw new TypeError("network unreachable");
    });

    const loanId = await requestLoan(bob.as, toolId);
    const [queued] = await eventsForLoan(t, loanId);
    await drain(t);

    expect(calls).toHaveLength(4);
    for (const c of calls) expect(c.url).toBe(WEBHOOK_URL);

    const jobs = await deliverJobs(t);
    expect(jobs).toHaveLength(4);
    const deltas = jobs.slice(1).map((j, i) => j.scheduledTime - jobs[i].scheduledTime);
    const expected = [30_000, 120_000, 600_000];
    deltas.forEach((d, i) => expect(Math.abs(d - expected[i]), `retry ${i + 1} delay ${d}ms`).toBeLessThan(2_000));
    for (const j of jobs) expect(j.args[0]).toEqual({ eventId: queued._id });

    const [ev] = await eventsForLoan(t, loanId);
    expect(ev.status).toBe("failed");
    expect(ev.attempts).toBe(4);
    expect(typeof ev.lastError).toBe("string");
    expect(ev.lastError!.length).toBeGreaterThan(0);
    expect(ev.lastError).not.toContain(CONVEX_TO_N8N_SECRET);

    const adminView = await admin.as.query(api.admin.listAutomationEvents, {});
    const row = adminView.find((r) => r._id === queued._id);
    expect(row).toBeDefined();
    expect(row!.status).toBe("failed");
    expect(row!.lastError).toBe(ev.lastError);
  });

  test("AC17: non-2xx responses count as failures (lastError mentions the status code)", async () => {
    const { t, bob, toolId } = await world();
    const { calls } = captureFetch(() => new Response("upstream broke", { status: 500 }));
    const loanId = await requestLoan(bob.as, toolId);
    await drain(t);
    expect(calls).toHaveLength(4);
    const [ev] = await eventsForLoan(t, loanId);
    expect(ev.status).toBe("failed");
    expect(ev.attempts).toBe(4);
    expect(ev.lastError).toMatch(/500/);
  });

  test("AC17: a retry that succeeds marks the event sent and stops retrying", async () => {
    const { t, bob, toolId } = await world();
    const { calls } = captureFetch((n) =>
      n === 1 ? new Response("busy", { status: 503 }) : new Response("ok", { status: 200 }),
    );
    const loanId = await requestLoan(bob.as, toolId);
    await drain(t);
    expect(calls).toHaveLength(2);
    // Each attempt is freshly signed and carries the same event.
    expect(JSON.parse(calls[0].raw).eventId).toBe(JSON.parse(calls[1].raw).eventId);
    const sig = calls[1].headers.get("X-LendLoop-Signature");
    const ts = calls[1].headers.get("X-LendLoop-Timestamp")!;
    expect(sig).toBe(await referenceSign(CONVEX_TO_N8N_SECRET, ts, calls[1].raw));
    const [ev] = await eventsForLoan(t, loanId);
    expect(ev.status).toBe("sent");
    expect(ev.attempts).toBe(2);
    expect(await deliverJobs(t)).toHaveLength(2);
  });

  test("AC17: a plain user cannot see the automation log", async () => {
    const { bob } = await world();
    await expect(bob.as.query(api.admin.listAutomationEvents, {})).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC19 (data side)
// ---------------------------------------------------------------------------
describe("AC19: loans.listMine carries recent automation activity per loan", () => {
  test("AC19: each loan has an activity array with notifications and reminders, newest first", async () => {
    const { t, alice, bob, toolId } = await world();
    const carol = await signIn(t, CAROL);
    const other = await createTool(alice.as, { name: "Other tool" });
    const carolsLoan = await requestLoan(carol.as, other);

    const loanId = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 2));
    await drain(t);
    vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    await alice.as.mutation(api.loans.approve, { loanId });
    await drain(t);

    // A reminder written back by n8n through the signed HTTP route.
    vi.setSystemTime(new Date(`${addDays(TODAY, 4)}T09:00:00.000Z`));
    const reminderKey = `${loanId}:${addDays(TODAY, 4)}`;
    const body = JSON.stringify({ idempotencyKey: reminderKey, loanId, status: "sent" });
    const res = await t.fetch("/n8n/reminder-status", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await signedHeaders(body)) },
      body,
    });
    expect(res.status).toBe(200);

    const mine = await bob.as.query(api.loans.listMine, {});
    expect(mine.map((l) => l._id)).toEqual([loanId]);
    expect(mine.map((l) => l._id)).not.toContain(carolsLoan);
    const activity = mine[0].activity;
    expect(Array.isArray(activity)).toBe(true);
    expect(activity).toHaveLength((await eventsForLoan(t, loanId)).length);

    const reminder = activity.find((a) => a.kind === "overdue_reminder");
    expect(reminder).toMatchObject({ kind: "overdue_reminder", status: "sent" });
    expect(typeof reminder!.sentAt).toBe("number");
    const notes = activity.filter((a) => a.kind === "request_notification");
    expect(notes).toHaveLength(2);
    for (const n of notes) expect(n.status).toBe("sent");

    for (const a of activity) expect(typeof a.createdAt).toBe("number");
    const times = activity.map((a) => a.createdAt);
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(activity[0].kind).toBe("overdue_reminder");
  });

  test("AC19: a loan with no events yet has an empty or queued activity list, never undefined", async () => {
    const { bob, toolId } = await world();
    await requestLoan(bob.as, toolId);
    const mine = await bob.as.query(api.loans.listMine, {});
    expect(Array.isArray(mine[0].activity)).toBe(true);
    for (const a of mine[0].activity) expect(["queued", "sent", "failed"]).toContain(a.status);
  });
});
