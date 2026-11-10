// Request notifications can't stay "queued" forever: each attempt times out after 10 s, and
// the sweepStuck cron turns a row with no progress for 15 minutes into a failed attempt (next
// retry, or failed with Resend available). A slow job that still runs repeats the same eventId.
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { DELIVERY_TIMEOUT_MS, MAX_ATTEMPTS, STUCK_AFTER_MS, STUCK_ERROR } from "../../convex/automation";
import {
  ADMIN,
  ALICE,
  BOB,
  allEvents,
  createTool,
  deliverJobs,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
  type TestInstance,
} from "../acceptance/_helpers";

useLendLoopEnv();

const drain = (t: TestInstance) => t.finishAllScheduledFunctions(vi.runAllTimers);

function stubFetch(impl: () => Response) {
  const mock = vi.fn(async (_url: string, _init: RequestInit) => impl());
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function world() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const admin = await signIn(t, ADMIN);
  const toolId = await createTool(alice.as);
  return { t, alice, bob, admin, toolId };
}

describe("fetch timeout", () => {
  test("every attempt carries an abort signal; a timeout is a failed attempt with a plain message", async () => {
    const { t, bob, toolId } = await world();
    const fetchMock = stubFetch(() => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await requestLoan(bob.as, toolId);
    await drain(t);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    for (const [, init] of fetchMock.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
    const [ev] = await allEvents(t);
    expect(ev.status).toBe("failed");
    expect(ev.lastError).toBe(`No answer from webhook within ${DELIVERY_TIMEOUT_MS / 1000} s`);
  });
});

describe("sweepStuck", () => {
  test("a queued row older than 15 minutes counts as a failed attempt and gets its retry", async () => {
    const { t, bob, toolId } = await world();
    const fetchMock = stubFetch(() => new Response("ok", { status: 200 }));
    await requestLoan(bob.as, toolId);
    // The delivery job hasn't run (as if it died), and 16 minutes pass.
    vi.advanceTimersByTime(STUCK_AFTER_MS + 60_000);
    expect(await t.mutation(internal.automation.sweepStuck, {})).toEqual({ swept: 1 });
    let [ev] = await allEvents(t);
    expect(ev).toMatchObject({ status: "queued", attempts: 1, lastError: STUCK_ERROR });
    expect(await deliverJobs(t)).toHaveLength(2);

    // If the "lost" job was only slow, both may reach n8n. They carry the same eventId, which
    // n8n's "Drop duplicate eventId" turns into one email; Convex ends with one sent row.
    await drain(t);
    [ev] = await allEvents(t);
    expect(ev.status).toBe("sent");
    const ids = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)).eventId);
    expect(new Set(ids)).toEqual(new Set([ev._id]));
  });

  test("a row waiting for a scheduled retry, or freshly queued, is left alone", async () => {
    const { t, alice, bob, toolId } = await world();
    stubFetch(() => new Response("down", { status: 502 }));
    await requestLoan(bob.as, toolId);
    // Only the first attempt runs: it fails and schedules the 30 s retry.
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(await t.mutation(internal.automation.sweepStuck, {})).toEqual({ swept: 0 });
    await requestLoan(bob.as, await createTool(alice.as, { name: "Ladder" }));
    expect(await t.mutation(internal.automation.sweepStuck, {})).toEqual({ swept: 0 });
  });

  test("a stuck last attempt is marked failed, and admin Resend then delivers it once", async () => {
    const { t, bob, admin, toolId } = await world();
    const fetchMock = stubFetch(() => new Response("ok", { status: 200 }));
    await requestLoan(bob.as, toolId);
    const [queued] = await allEvents(t);
    // Three attempts already failed and the last job was lost.
    await t.run(async (ctx) => {
      await ctx.db.patch(queued._id, { attempts: MAX_ATTEMPTS - 1, lastAttemptAt: Date.now() });
      for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
        if (job.state.kind === "pending") await ctx.scheduler.cancel(job._id);
      }
    });
    vi.advanceTimersByTime(STUCK_AFTER_MS + 60_000);
    expect(await t.mutation(internal.automation.sweepStuck, {})).toEqual({ swept: 1 });
    let [ev] = await allEvents(t);
    expect(ev).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, lastError: STUCK_ERROR });

    await admin.as.mutation(api.admin.resendEvent, { eventId: ev._id });
    // Resend restarts the clock: the sweep leaves the fresh attempt alone.
    expect(await t.mutation(internal.automation.sweepStuck, {})).toEqual({ swept: 0 });
    await drain(t);
    [ev] = await allEvents(t);
    expect(ev.status).toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
