// Server-side data minimisation: every query returns exactly the fields its screen reads, other
// users' names leave Convex as first name + last initial, and no other user's email is ever in
// a client response (admins get a masked hint only).
import { describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { displayName, maskEmail } from "../../convex/lib/public";
import { shortName } from "../../lib/names";
import {
  ADMIN,
  ALICE,
  BOB,
  CAROL,
  TODAY,
  addDays,
  createTool,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
} from "../acceptance/_helpers";

useLendLoopEnv();

const keys = (o: object) => Object.keys(o).sort();
const FULL_NAMES = [ALICE.name, BOB.name, CAROL.name, ADMIN.name];
const EMAILS = [ALICE.email, BOB.email, CAROL.email, ADMIN.email];

async function world() {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const carol = await signIn(t, CAROL);
  const admin = await signIn(t, ADMIN);
  const drill = await createTool(alice.as, { name: "Drill" });
  const pending = await requestLoan(bob.as, drill, addDays(TODAY, 2), addDays(TODAY, 4));
  const approved = await requestLoan(carol.as, drill, addDays(TODAY, 10), addDays(TODAY, 11));
  await alice.as.mutation(api.loans.approve, { loanId: approved });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, alice, bob, carol, admin, drill, pending, approved };
}

describe("exact keys per query", () => {
  test("Browse (tools.list)", async () => {
    const { bob } = await world();
    const [row] = await bob.as.query(api.tools.list, {});
    expect(keys(row)).toEqual(["_id", "category", "condition", "description", "isMine", "name", "ownerName", "ownerTrusted", "status"]);
    expect(row.ownerName).toBe("Alice L.");
  });

  test("My listings (tools.listMine)", async () => {
    const { alice } = await world();
    const [tool] = await alice.as.query(api.tools.listMine, {});
    expect(keys(tool)).toEqual(["_id", "category", "condition", "description", "name", "pendingCount", "requests", "status"]);
    for (const r of tool.requests) expect(keys(r)).toEqual(["borrowerName", "endDate", "startDate", "status"]);
    expect(tool.requests.map((r) => r.borrowerName).sort()).toEqual(["Bob B.", "Carol N."]);
  });

  test("My requests (loans.listMine)", async () => {
    const { bob, carol } = await world();
    const [waiting] = await bob.as.query(api.loans.listMine, {});
    expect(keys(waiting)).toEqual([
      "_id", "activity", "createdAt", "datesTaken", "emailStatus", "endDate", "lenderName", "lenderTrusted",
      "startDate", "status", "toolId", "toolName", "toolRemoved",
    ]);
    expect(waiting.lenderName).toBe("Alice L.");
    const [approved] = await carol.as.query(api.loans.listMine, {});
    expect(keys(approved)).toContain("decidedAt");
  });

  test("Incoming (loans.listIncoming): an opaque borrower key, no user ids", async () => {
    const { alice, bob, carol } = await world();
    const rows = await alice.as.query(api.loans.listIncoming, {});
    for (const r of rows) {
      expect(keys(r)).toEqual([
        "_id", "borrowerKey", "borrowerName", "borrowerTrusted", "createdAt", "endDate", "startDate", "status", "toolId", "toolName",
      ]);
    }
    expect(rows.map((r) => r.borrowerKey).sort()).toEqual(["b1", "b2"]);
    const json = JSON.stringify(rows);
    expect(json).not.toContain(bob.id);
    expect(json).not.toContain(carol.id);
  });

  test("users.me: the caller's own display data only", async () => {
    const { bob } = await world();
    const me = await bob.as.query(api.users.me, {});
    expect(keys(me)).toEqual(["_id", "name", "role"]);
    await bob.as.mutation(api.users.setTimeZone, { timeZone: "Asia/Karachi" });
    expect(keys(await bob.as.query(api.users.me, {}))).toEqual(["_id", "name", "role", "timeZone"]);
  });

  test("admin queries: explicit projections, short names, masked emails", async () => {
    const { admin } = await world();
    const [loan] = await admin.as.query(api.admin.listAllLoans, {});
    expect(keys(loan).filter((k) => k !== "decidedAt")).toEqual([
      "_id", "borrowerName", "endDate", "lenderName", "lenderTrusted", "startDate", "status", "toolId", "toolName", "toolRemoved",
    ]);
    const [tool] = await admin.as.query(api.admin.listTools, {});
    expect(keys(tool)).toEqual(["_id", "name", "ownerId", "ownerName", "status"]);
    const users = await admin.as.query(api.admin.listUsers, {});
    for (const u of users) expect(keys(u)).toEqual(["_id", "emailHint", "name", "role", "trustedLender"]);
    expect(users.find((u) => u.name === "Alice L.")?.emailHint).toBe("a***@example.com");
    const events = await admin.as.query(api.admin.listAutomationEvents, {});
    for (const e of events) {
      expect(keys(e).filter((k) => k !== "lastError")).toEqual(["_id", "attempts", "blockerLoanId", "createdAt", "kind", "loanId", "status", "type"]);
    }
    expect(events.map((e) => e.type)).toContain("loan.approved");
  });
});

describe("no full names or emails of other people leave the server", () => {
  test("every client response for a plain user", async () => {
    const { alice, bob, carol } = await world();
    for (const who of [alice, bob, carol]) {
      const json = JSON.stringify([
        await who.as.query(api.tools.list, {}),
        await who.as.query(api.tools.listMine, {}),
        await who.as.query(api.loans.listMine, {}),
        await who.as.query(api.loans.listIncoming, {}),
      ]);
      expect(json).not.toContain("@");
      for (const full of FULL_NAMES) expect(json).not.toContain(full);
    }
  });

  test("admin responses: no full address, no full name", async () => {
    const { admin } = await world();
    const json = JSON.stringify([
      await admin.as.query(api.admin.listAllLoans, {}),
      await admin.as.query(api.admin.listTools, {}),
      await admin.as.query(api.admin.listUsers, {}),
      await admin.as.query(api.admin.listAutomationEvents, {}),
    ]);
    for (const email of EMAILS) expect(json).not.toContain(email);
    for (const full of FULL_NAMES) expect(json).not.toContain(full);
    expect(json).not.toContain("idempotencyKey");
  });
});

describe("server and browser name rules agree", () => {
  test.each(["Ben Carter", "maya rodriguez", "Olivia", "  Jake   Ryan  Thompson ", "", "Ben C."])("%j", (name) => {
    expect(displayName(name)).toBe(shortName(name));
  });
  test("masked email", () => {
    expect(maskEmail("ben@example.com")).toBe("b***@example.com");
    expect(maskEmail("")).toBe("no email");
  });
});
