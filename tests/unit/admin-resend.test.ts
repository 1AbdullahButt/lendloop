// admin.resendEvent: an admin can re-queue a failed request notification. Same row and
// idempotency key, one delivery job, admin-only, and only for failed notifications.
import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_ATTEMPTS } from "../../convex/automation";
import {
  ADMIN,
  ALICE,
  BOB,
  allEvents,
  createTool,
  deliverJobs,
  eventsByKey,
  expectConvexError,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
  type TestInstance,
} from "../acceptance/_helpers";

useLendLoopEnv();

function failFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("down", { status: 502 })),
  );
}

function okFetch() {
  const mock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function drain(t: TestInstance) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Bob requests Alice's tool while n8n is down, so the notification ends up failed. */
async function failedNotification() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const admin = await signIn(t, ADMIN);
  const toolId = await createTool(alice.as);
  failFetch();
  const loanId = await requestLoan(bob.as, toolId);
  await drain(t);
  const [event] = await allEvents(t);
  expect(event.status).toBe("failed");
  expect(event.attempts).toBe(MAX_ATTEMPTS);
  return { t, alice, bob, admin, loanId, eventId: event._id };
}

describe("admin.resendEvent", () => {
  test("re-queues the same row, delivers it once, and marks it sent", async () => {
    const { t, admin, eventId } = await failedNotification();
    const before = (await allEvents(t))[0];
    const jobsBefore = (await deliverJobs(t)).length;

    const fetchMock = okFetch();
    await admin.as.mutation(api.admin.resendEvent, { eventId });
    const queued = (await allEvents(t))[0];
    expect(queued.status).toBe("queued");
    expect(queued.lastError).toBeUndefined();
    expect((await deliverJobs(t)).length).toBe(jobsBefore + 1);

    await drain(t);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = await eventsByKey(t, before.idempotencyKey);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(eventId);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].attempts).toBe(MAX_ATTEMPTS + 1);
    expect(typeof rows[0].sentAt).toBe("number");
  });

  test("a resend that fails again is marked failed without a new retry chain", async () => {
    const { t, admin, eventId } = await failedNotification();
    failFetch();
    await admin.as.mutation(api.admin.resendEvent, { eventId });
    const jobsAfterResend = (await deliverJobs(t)).length;
    await drain(t);

    const [row] = await allEvents(t);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(MAX_ATTEMPTS + 1);
    expect(row.lastError).toMatch(/502/);
    // Only the resend's own job ran; markFailed scheduled no further retries.
    expect((await deliverJobs(t)).length).toBe(jobsAfterResend);
  });

  test("a second resend while the first is queued is refused, so only one job is scheduled", async () => {
    const { t, admin, eventId } = await failedNotification();
    okFetch();
    await admin.as.mutation(api.admin.resendEvent, { eventId });
    const jobs = (await deliverJobs(t)).length;
    await expectConvexError(admin.as.mutation(api.admin.resendEvent, { eventId }), "CONFLICT");
    expect((await deliverJobs(t)).length).toBe(jobs);
  });

  test("refuses a stale 'new request' email once the borrower has cancelled", async () => {
    const { t, bob, admin, loanId, eventId } = await failedNotification();
    await bob.as.mutation(api.loans.cancel, { loanId });
    await drain(t);
    const jobs = (await deliverJobs(t)).length;
    okFetch();
    await expectConvexError(admin.as.mutation(api.admin.resendEvent, { eventId }), "CONFLICT");
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.status).toBe("failed");
    expect((await deliverJobs(t)).length).toBe(jobs);
  });

  test("resends a failed approval email while approved, but not after the return", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const bob = await signIn(t, BOB);
    const admin = await signIn(t, ADMIN);
    const loanId = await requestLoan(bob.as, await createTool(alice.as));
    await drain(t);
    failFetch();
    await alice.as.mutation(api.loans.approve, { loanId });
    await drain(t);
    const approval = (await allEvents(t)).find((e) => e.idempotencyKey === `${loanId}:loan.approved`)!;
    expect(approval.status).toBe("failed");

    okFetch();
    await admin.as.mutation(api.admin.resendEvent, { eventId: approval._id });
    await drain(t);
    expect((await t.run((ctx) => ctx.db.get(approval._id)))?.status).toBe("sent");

    // Fail it again, return the tool, and the approval email is now out of date.
    await t.run((ctx) => ctx.db.patch(approval._id, { status: "failed" }));
    await alice.as.mutation(api.loans.markReturned, { loanId });
    await drain(t);
    await expectConvexError(admin.as.mutation(api.admin.resendEvent, { eventId: approval._id }), "CONFLICT");
  });

  test("refuses an email that was already sent", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const bob = await signIn(t, BOB);
    const admin = await signIn(t, ADMIN);
    await requestLoan(bob.as, await createTool(alice.as));
    await drain(t);
    const [event] = await allEvents(t);
    expect(event.status).toBe("sent");
    await expectConvexError(admin.as.mutation(api.admin.resendEvent, { eventId: event._id }), "CONFLICT");
  });

  test("refuses overdue reminders, which n8n retries itself", async () => {
    const { t, admin, loanId } = await failedNotification();
    const reminderId = await t.run((ctx) =>
      ctx.db.insert("automationEvents", {
        loanId: loanId as Id<"loans">,
        kind: "overdue_reminder",
        idempotencyKey: `${loanId}:2026-11-06`,
        status: "failed",
        attempts: 1,
        createdAt: Date.now(),
        lastError: "smtp down",
      }),
    );
    await expectConvexError(admin.as.mutation(api.admin.resendEvent, { eventId: reminderId }), "INVALID");
    expect((await t.run((ctx) => ctx.db.get(reminderId)))?.status).toBe("failed");
  });

  test("NOT_FOUND for an event that no longer exists", async () => {
    const { t, admin, eventId } = await failedNotification();
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectConvexError(admin.as.mutation(api.admin.resendEvent, { eventId }), "NOT_FOUND");
  });

  test("plain users get FORBIDDEN and guests UNAUTHENTICATED; nothing changes", async () => {
    const { t, alice, bob, eventId } = await failedNotification();
    const jobs = (await deliverJobs(t)).length;
    await expectConvexError(bob.as.mutation(api.admin.resendEvent, { eventId }), "FORBIDDEN");
    await expectConvexError(alice.as.mutation(api.admin.resendEvent, { eventId }), "FORBIDDEN");
    await expectConvexError(t.mutation(api.admin.resendEvent, { eventId }), "UNAUTHENTICATED");
    expect((await allEvents(t))[0].status).toBe("failed");
    expect((await deliverJobs(t)).length).toBe(jobs);
  });
});
