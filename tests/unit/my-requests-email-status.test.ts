// loans.listMine: each loan carries `emailStatus` (worst state of its notification emails)
// and each notification in `activity` says which transition it was about.
import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ADMIN,
  ALICE,
  BOB,
  allEvents,
  createTool,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
  type TestInstance,
} from "../acceptance/_helpers";

useLendLoopEnv();

async function drain(t: TestInstance) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function world() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const toolId = await createTool(alice.as);
  return { t, alice, bob, toolId };
}

describe("loans.listMine emailStatus", () => {
  test("null before any email, queued while sending, sent once delivered", async () => {
    const { t, bob, alice, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    let [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("queued");
    expect(mine.activity[0]).toMatchObject({ kind: "request_notification", status: "queued", type: "loan.requested" });

    await drain(t);
    [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("sent");

    await alice.as.mutation(api.loans.approve, { loanId });
    await drain(t);
    [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("sent");
    expect(mine.activity.map((a) => a.type)).toEqual(["loan.approved", "loan.requested"]);

    // A loan with no events at all reports null, not "sent".
    await t.run(async (ctx) => {
      for (const e of await ctx.db.query("automationEvents").collect()) await ctx.db.delete(e._id);
    });
    [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBeNull();
    expect(mine.activity).toEqual([]);
  });

  test("failed when the lender's email gave up, even after a later email was sent", async () => {
    const { t, bob, alice, toolId } = await world();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const loanId = await requestLoan(bob.as, toolId);
    await drain(t);
    let [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("failed");
    expect(mine.activity[0]).toMatchObject({ status: "failed", type: "loan.requested" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    await alice.as.mutation(api.loans.approve, { loanId });
    await drain(t);
    [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("failed");
  });

  test("goes back to sent after an admin resends the failed email", async () => {
    const { t, bob, toolId } = await world();
    const admin = await signIn(t, ADMIN);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await requestLoan(bob.as, toolId);
    await drain(t);
    const [event] = await allEvents(t);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    await admin.as.mutation(api.admin.resendEvent, { eventId: event._id });
    let [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("queued");
    await drain(t);
    [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("sent");
  });

  test("reminders do not count as emails about the request, and leak no keys or errors", async () => {
    const { t, bob, toolId } = await world();
    const loanId = await requestLoan(bob.as, toolId);
    await drain(t);
    await t.run((ctx) =>
      ctx.db.insert("automationEvents", {
        loanId,
        kind: "overdue_reminder",
        idempotencyKey: `${loanId}:2026-11-06`,
        status: "failed",
        attempts: 1,
        createdAt: Date.now() + 1,
        lastError: "smtp down",
      }),
    );
    const [mine] = await bob.as.query(api.loans.listMine, {});
    expect(mine.emailStatus).toBe("sent");
    const reminder = mine.activity.find((a) => a.kind === "overdue_reminder")!;
    expect(reminder.status).toBe("failed");
    expect(reminder).not.toHaveProperty("type");
    const json = JSON.stringify(mine);
    expect(json).not.toContain("idempotencyKey");
    expect(json).not.toContain("smtp down");
  });
});
