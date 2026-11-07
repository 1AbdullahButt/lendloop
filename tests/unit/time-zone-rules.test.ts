// Server side of per-user time zones: users.setTimeZone validates real IANA names, R2 ("start
// date not in the past") and approve-before-start use the acting user's own "today", users
// without a zone stay on UTC, and the daily overdue check stays on UTC.
import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ALICE,
  BOB,
  CAROL,
  createTool,
  expectConvexError,
  getUser,
  newTest,
  signIn,
  signedHeaders,
  useLendLoopEnv,
  type TestInstance,
} from "../acceptance/_helpers";

useLendLoopEnv();

// 9:00 PM Sat, Nov 7 in New York = 02:00 Nov 8 UTC.
const NY_9PM = Date.UTC(2026, 10, 8, 2, 0);
// 1:00 AM Sun, Nov 8 in Karachi = 20:00 Nov 7 UTC.
const KARACHI_1AM = Date.UTC(2026, 10, 7, 20, 0);

async function zoned(t: TestInstance, who: typeof ALICE, timeZone?: string) {
  const user = await signIn(t, who);
  if (timeZone) await user.as.mutation(api.users.setTimeZone, { timeZone });
  return user;
}

describe("users.setTimeZone", () => {
  test("stores a real IANA zone on the caller's own row; users.me returns it", async () => {
    const t = newTest();
    const bob = await signIn(t, BOB);
    expect(await bob.as.mutation(api.users.setTimeZone, { timeZone: " Asia/Karachi " })).toBe("Asia/Karachi");
    expect((await bob.as.query(api.users.me, {})).timeZone).toBe("Asia/Karachi");
  });

  test("rejects anything that is not a real IANA zone, and changes nothing", async () => {
    const t = newTest();
    const bob = await zoned(t, BOB, "America/New_York");
    for (const timeZone of ["", "+05:00", "GMT+5", "Mars/Olympus", "asia/karachi", "<script>"]) {
      await expectConvexError(bob.as.mutation(api.users.setTimeZone, { timeZone }), "INVALID", timeZone);
    }
    expect((await getUser(t, bob.id))!.timeZone).toBe("America/New_York");
  });

  test("guests get UNAUTHENTICATED", async () => {
    const t = newTest();
    await expectConvexError(t.mutation(api.users.setTimeZone, { timeZone: "Asia/Karachi" }), "UNAUTHENTICATED");
  });
});

describe("R2 uses the requester's own today", () => {
  test("New York at 9 PM: Nov 7 is still today there, though UTC is on Nov 8", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const toolId = await createTool(alice.as);
    const bob = await zoned(t, BOB, "America/New_York");
    vi.setSystemTime(NY_9PM);
    await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-07", endDate: "2026-11-08" });
    await expectConvexError(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-06", endDate: "2026-11-08" }),
      "INVALID",
    );
  });

  test("Karachi at 1 AM: Nov 7 is already past there, though UTC is still on Nov 7", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const toolId = await createTool(alice.as);
    const bob = await zoned(t, BOB, "Asia/Karachi");
    vi.setSystemTime(KARACHI_1AM);
    await expectConvexError(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-07", endDate: "2026-11-09" }),
      "INVALID",
    );
    await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-08", endDate: "2026-11-09" });
  });

  test("a user with no zone stays on UTC (what the acceptance tests assume)", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const toolId = await createTool(alice.as);
    const bob = await signIn(t, BOB);
    vi.setSystemTime(NY_9PM);
    await expectConvexError(
      bob.as.mutation(api.loans.request, { toolId, startDate: "2026-11-07", endDate: "2026-11-08" }),
      "INVALID",
    );
  });
});

describe("approve-before-start uses the lender's own today", () => {
  async function requestStartingNov7(t: TestInstance, lenderZone: string) {
    const lender = await zoned(t, ALICE, lenderZone);
    const toolId = await createTool(lender.as);
    // A borrower in New York asks at 3 PM on Nov 7 their time (20:00 UTC) to start that day.
    const borrower = await zoned(t, CAROL, "America/New_York");
    vi.setSystemTime(KARACHI_1AM);
    const loanId = await borrower.as.mutation(api.loans.request, {
      toolId,
      startDate: "2026-11-07",
      endDate: "2026-11-09",
    });
    return { lender, loanId };
  }

  test("a lender in Karachi at 1 AM on Nov 8 can no longer approve a Nov 7 start", async () => {
    const t = newTest();
    const { lender, loanId } = await requestStartingNov7(t, "Asia/Karachi");
    await expectConvexError(lender.as.mutation(api.loans.approve, { loanId }), "INVALID");
  });

  test("a lender in New York at the same moment (still Nov 7) can", async () => {
    const t = newTest();
    const { lender, loanId } = await requestStartingNov7(t, "America/New_York");
    await lender.as.mutation(api.loans.approve, { loanId });
  });
});

describe("the daily overdue check stays on UTC", () => {
  test("a Karachi borrower's loan ending Nov 7 is not overdue at 1 AM Nov 8 Karachi time (still Nov 7 UTC)", async () => {
    const t = newTest();
    const alice = await signIn(t, ALICE);
    const toolId = await createTool(alice.as);
    const bob = await zoned(t, BOB, "Asia/Karachi");
    const loanId = await t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId,
        borrowerId: bob.id,
        lenderId: alice.id,
        startDate: "2026-11-05",
        endDate: "2026-11-07",
        status: "approved",
        createdAt: Date.now(),
        decidedAt: Date.now(),
      }),
    );
    const overdueIds = async () => {
      const res = await t.fetch("/n8n/overdue-loans", { method: "GET", headers: await signedHeaders("") });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { loans?: { loanId: string }[] } | { loanId: string }[];
      const items = Array.isArray(body) ? body : (body.loans ?? []);
      return items.map((i) => i.loanId);
    };

    vi.setSystemTime(KARACHI_1AM);
    expect(await overdueIds()).not.toContain(loanId);
    // Once UTC reaches Nov 8, it is overdue for everyone.
    vi.setSystemTime(Date.UTC(2026, 10, 8, 0, 30));
    expect(await overdueIds()).toContain(loanId);
  });
});
