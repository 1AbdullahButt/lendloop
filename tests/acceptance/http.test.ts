import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  ALICE,
  BOB,
  CAROL,
  CONVEX_TO_N8N_SECRET,
  TODAY,
  addDays,
  allEvents,
  createTool,
  eventsByKey,
  newTest,
  requestLoan,
  signIn,
  signedHeaders,
  todayUtc,
  useLendLoopEnv,
  type TestInstance,
} from "./_helpers";

useLendLoopEnv();

const OVERDUE_PATH = "/n8n/overdue-loans";
const STATUS_PATH = "/n8n/reminder-status";
const MIN = 60 * 1000;
// Six days after the suite's pinned TODAY; loans ending before this are overdue.
const LATER = new Date(`${addDays(TODAY, 6)}T10:00:00.000Z`);

/**
 * One genuinely overdue loan (approved, endDate in the past) plus loans that must
 * NOT be reported: approved ending today, returned/pending/declined in the past.
 */
async function overdueWorld() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const carol = await signIn(t, CAROL);
  const toolId = await createTool(alice.as, { name: "Tile cutter", category: "hand_tools" });
  const overdue = await requestLoan(bob.as, toolId, addDays(TODAY, 1), addDays(TODAY, 3));
  await alice.as.mutation(api.loans.approve, { loanId: overdue });

  vi.setSystemTime(LATER);
  const today = todayUtc();
  const other = await createTool(alice.as, { name: "Other tool" });
  const notOverdue = await t.run(async (ctx) => {
    const base = { toolId: other, borrowerId: carol.id, lenderId: alice.id, createdAt: Date.now() };
    return [
      await ctx.db.insert("loans", { ...base, startDate: addDays(today, -2), endDate: today, status: "approved" }),
      await ctx.db.insert("loans", {
        ...base,
        startDate: addDays(today, -9),
        endDate: addDays(today, -5),
        status: "returned",
        returnedAt: Date.now(),
      }),
      await ctx.db.insert("loans", { ...base, startDate: addDays(today, -9), endDate: addDays(today, -5), status: "pending" }),
      await ctx.db.insert("loans", { ...base, startDate: addDays(today, -9), endDate: addDays(today, -5), status: "declined" }),
      await ctx.db.insert("loans", { ...base, startDate: addDays(today, -9), endDate: addDays(today, -5), status: "cancelled" }),
    ];
  });
  return { t, alice, bob, carol, toolId, overdue, notOverdue, today };
}

async function signedGet(t: TestInstance, opts: { secret?: string; timestamp?: number } = {}) {
  return await t.fetch(OVERDUE_PATH, { method: "GET", headers: await signedHeaders("", opts) });
}

async function signedPost(t: TestInstance, payload: unknown, opts: { secret?: string; timestamp?: number } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return await t.fetch(STATUS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await signedHeaders(body, opts)) },
    body,
  });
}

async function expect401(res: Response) {
  expect(res.status).toBe(401);
  expect(await res.text()).toBe("");
}

// ---------------------------------------------------------------------------
// AC15
// ---------------------------------------------------------------------------
describe("AC15: signature checks on inbound HTTP actions", () => {
  test("AC15: GET /n8n/overdue-loans without signature headers -> 401, empty body", async () => {
    const { t } = await overdueWorld();
    await expect401(await t.fetch(OVERDUE_PATH, { method: "GET" }));
  });

  test("AC15: GET with only one of the two headers -> 401", async () => {
    const { t } = await overdueWorld();
    const h = await signedHeaders("");
    await expect401(await t.fetch(OVERDUE_PATH, { headers: { "X-LendLoop-Signature": h["X-LendLoop-Signature"] } }));
    await expect401(await t.fetch(OVERDUE_PATH, { headers: { "X-LendLoop-Timestamp": h["X-LendLoop-Timestamp"] } }));
  });

  test("AC15: GET signed with the wrong secret -> 401", async () => {
    const { t } = await overdueWorld();
    await expect401(await signedGet(t, { secret: "wrong-secret" }));
    // The outbound secret must not be accepted inbound either.
    await expect401(await signedGet(t, { secret: CONVEX_TO_N8N_SECRET }));
  });

  test("AC15: GET with a stale (6 min old) or future (6 min ahead) timestamp -> 401", async () => {
    const { t } = await overdueWorld();
    await expect401(await signedGet(t, { timestamp: Date.now() - 6 * MIN }));
    await expect401(await signedGet(t, { timestamp: Date.now() + 6 * MIN }));
  });

  test("AC15: GET replayed after 6 minutes -> 401 (same headers that worked before)", async () => {
    const { t } = await overdueWorld();
    const headers = await signedHeaders("");
    expect((await t.fetch(OVERDUE_PATH, { headers })).status).toBe(200);
    vi.setSystemTime(Date.now() + 6 * MIN);
    await expect401(await t.fetch(OVERDUE_PATH, { headers }));
  });

  test("AC15: GET with a malformed signature or a signature for another timestamp -> 401", async () => {
    const { t } = await overdueWorld();
    const good = await signedHeaders("");
    await expect401(
      await t.fetch(OVERDUE_PATH, { headers: { ...good, "X-LendLoop-Signature": "sha256=not-hex" } }),
    );
    await expect401(
      await t.fetch(OVERDUE_PATH, {
        headers: { ...good, "X-LendLoop-Signature": good["X-LendLoop-Signature"].replace("sha256=", "") },
      }),
    );
    await expect401(
      await t.fetch(OVERDUE_PATH, {
        headers: { ...good, "X-LendLoop-Timestamp": String(Number(good["X-LendLoop-Timestamp"]) - 1000) },
      }),
    );
  });

  test("AC15: GET within the window (4 minutes old) -> 200", async () => {
    const { t } = await overdueWorld();
    const res = await signedGet(t, { timestamp: Date.now() - 4 * MIN });
    expect(res.status).toBe(200);
  });

  test("AC15: POST /n8n/reminder-status rejects missing, wrong, stale and tampered signatures with 401 and writes nothing", async () => {
    const { t, overdue, today } = await overdueWorld();
    const before = (await allEvents(t)).length;
    const payload = { idempotencyKey: `${overdue}:${today}`, loanId: overdue, status: "sent" };
    const body = JSON.stringify(payload);

    await expect401(
      await t.fetch(STATUS_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body }),
    );
    await expect401(await signedPost(t, payload, { secret: "wrong-secret" }));
    await expect401(await signedPost(t, payload, { timestamp: Date.now() - 6 * MIN }));
    await expect401(await signedPost(t, payload, { timestamp: Date.now() + 6 * MIN }));
    // Signature computed over a different body.
    const signedForOther = await signedHeaders(JSON.stringify({ ...payload, status: "failed" }));
    await expect401(
      await t.fetch(STATUS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...signedForOther },
        body,
      }),
    );
    // Byte-level tamper (whitespace) also fails: the raw body is what is signed.
    const signedCompact = await signedHeaders(body);
    await expect401(
      await t.fetch(STATUS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...signedCompact },
        body: JSON.stringify(payload, null, 2),
      }),
    );

    expect((await allEvents(t)).length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// GET /n8n/overdue-loans contract (SPEC 6.2)
// ---------------------------------------------------------------------------
describe("AC15/AC16: GET /n8n/overdue-loans payload", () => {
  test("AC16: returns exactly the overdue loans with the SPEC 6.2 fields and key <loanId>:<today UTC>", async () => {
    const { t, overdue, today } = await overdueWorld();
    const res = await signedGet(t);
    expect(res.status).toBe(200);
    const items = (await res.json()) as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]).sort()).toEqual(
      ["borrowerEmail", "borrowerName", "endDate", "idempotencyKey", "loanId", "toolName"].sort(),
    );
    expect(items[0]).toEqual({
      loanId: overdue,
      toolName: "Tile cutter",
      borrowerName: BOB.name,
      borrowerEmail: BOB.email,
      endDate: addDays(TODAY, 3),
      idempotencyKey: `${overdue}:${today}`,
    });
    expect(today).toBe(addDays(TODAY, 6));
    // The lender's contact is not part of this payload.
    expect(JSON.stringify(items)).not.toContain(ALICE.email);
  });

  test("AC16: loans already reminded today (sent) are excluded; a reminder from yesterday does not exclude", async () => {
    const { t, overdue, today } = await overdueWorld();
    await t.run(async (ctx) => {
      await ctx.db.insert("automationEvents", {
        loanId: overdue,
        kind: "overdue_reminder",
        idempotencyKey: `${overdue}:${addDays(today, -1)}`,
        status: "sent",
        attempts: 1,
        createdAt: Date.now() - 24 * 60 * MIN,
        sentAt: Date.now() - 24 * 60 * MIN,
      });
    });
    let items = (await (await signedGet(t)).json()) as Array<{ loanId: string; idempotencyKey: string }>;
    expect(items.map((i) => i.loanId)).toEqual([overdue]);
    expect(items[0].idempotencyKey).toBe(`${overdue}:${today}`);

    const post = await signedPost(t, { idempotencyKey: `${overdue}:${today}`, loanId: overdue, status: "sent" });
    expect(post.status).toBe(200);
    items = (await (await signedGet(t)).json()) as Array<{ loanId: string; idempotencyKey: string }>;
    expect(items).toEqual([]);
  });

  test("AC16: an overdue loan whose tool was later returned is no longer listed", async () => {
    const { t, alice, overdue } = await overdueWorld();
    await alice.as.mutation(api.loans.markReturned, { loanId: overdue });
    const items = (await (await signedGet(t)).json()) as unknown[];
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC16: POST /n8n/reminder-status idempotency
// ---------------------------------------------------------------------------
describe("AC16: POST /n8n/reminder-status is idempotent", () => {
  test("AC16: same idempotencyKey twice -> 200 both times, one row, unchanged the second time", async () => {
    const { t, overdue, today } = await overdueWorld();
    const key = `${overdue}:${today}`;
    const payload = { idempotencyKey: key, loanId: overdue, status: "sent" };

    const first = await signedPost(t, payload);
    expect(first.status).toBe(200);
    const rows1 = await eventsByKey(t, key);
    expect(rows1).toHaveLength(1);
    expect(rows1[0]).toMatchObject({
      loanId: overdue,
      kind: "overdue_reminder",
      idempotencyKey: key,
      status: "sent",
    });
    expect(typeof rows1[0].sentAt).toBe("number");

    // n8n retries a minute later with a fresh signature.
    vi.setSystemTime(Date.now() + MIN);
    const second = await signedPost(t, payload);
    expect(second.status).toBe(200);
    const rows2 = await eventsByKey(t, key);
    expect(rows2).toHaveLength(1);
    expect(rows2[0]).toEqual(rows1[0]);
  });

  test("AC16: a failed reminder is stored with status failed and the error as lastError", async () => {
    const { t, overdue, today } = await overdueWorld();
    const key = `${overdue}:${today}`;
    const res = await signedPost(t, { idempotencyKey: key, loanId: overdue, status: "failed", error: "SMTP timeout" });
    expect(res.status).toBe(200);
    const rows = await eventsByKey(t, key);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "overdue_reminder", status: "failed", lastError: "SMTP timeout" });
  });

  test("AC16: different days produce different rows for the same loan", async () => {
    const { t, overdue, today } = await overdueWorld();
    expect((await signedPost(t, { idempotencyKey: `${overdue}:${today}`, loanId: overdue, status: "sent" })).status).toBe(200);
    vi.setSystemTime(new Date(`${addDays(today, 1)}T10:00:00.000Z`));
    const tomorrow = todayUtc();
    expect((await signedPost(t, { idempotencyKey: `${overdue}:${tomorrow}`, loanId: overdue, status: "sent" })).status).toBe(200);
    const reminders = (await allEvents(t)).filter((e) => e.kind === "overdue_reminder" && e.loanId === overdue);
    expect(reminders.map((r) => r.idempotencyKey).sort()).toEqual([`${overdue}:${today}`, `${overdue}:${tomorrow}`]);
  });

  test("AC16: a correctly signed but malformed body -> 400 and nothing written", async () => {
    const { t, overdue, today } = await overdueWorld();
    const before = (await allEvents(t)).length;
    const bad: unknown[] = [
      "not json",
      { idempotencyKey: `${overdue}:${today}`, loanId: overdue, status: "bogus" },
      { loanId: overdue, status: "sent" },
      { idempotencyKey: `${overdue}:${today}`, status: "sent" },
    ];
    for (const b of bad) {
      const res = await signedPost(t, b);
      expect(res.status, `body ${JSON.stringify(b)}`).toBe(400);
    }
    expect((await allEvents(t)).length).toBe(before);
  });
});
