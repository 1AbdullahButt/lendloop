/// <reference types="vite/client" />
// Shared fixtures for the acceptance suite. Everything here is test-only:
// fake identities on @example.com and obviously fake secrets.
import { convexTest } from "convex-test";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "../../convex/test.setup";

// ---------------------------------------------------------------------------
// Clock. The suite pins "now" so UTC "today" is deterministic (no midnight flakes).
// ---------------------------------------------------------------------------
export const NOW = new Date("2026-11-06T12:00:00.000Z");
export const TODAY = "2026-11-06";

export function todayUtc(): string {
  return new Date(Date.now()).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Environment. Values are fake; no real endpoint or secret is ever used.
// ---------------------------------------------------------------------------
export const ADMIN_EMAIL = "admin@example.com";
export const ADMIN_EMAILS_VALUE = `other-admin@example.com,${ADMIN_EMAIL}`;
export const WEBHOOK_URL = "https://n8n.example.com/webhook/test";
export const CONVEX_TO_N8N_SECRET = "test-secret-convex-to-n8n";
export const N8N_TO_CONVEX_SECRET = "test-secret-n8n-to-convex";

/**
 * Registers beforeEach/afterEach hooks: fake timers pinned to NOW, stubbed env,
 * and a default fetch stub that answers 200 so no test ever touches the network.
 * Scheduled functions only run when a test drains them with
 * `t.finishAllScheduledFunctions(vi.runAllTimers)`.
 */
export function useLendLoopEnv(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("ADMIN_EMAILS", ADMIN_EMAILS_VALUE);
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", WEBHOOK_URL);
    vi.stubEnv("CONVEX_TO_N8N_SECRET", CONVEX_TO_N8N_SECRET);
    vi.stubEnv("N8N_TO_CONVEX_SECRET", N8N_TO_CONVEX_SECRET);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
}

// ---------------------------------------------------------------------------
// Test instance and identities
// ---------------------------------------------------------------------------
export function newTest() {
  return convexTest(schema, modules);
}
export type TestInstance = ReturnType<typeof newTest>;
export type AsUser = ReturnType<TestInstance["withIdentity"]>;

export type Who = { subject: string; email: string; name: string };
export const ALICE: Who = { subject: "user_alice", email: "alice@example.com", name: "Alice Lender" };
export const BOB: Who = { subject: "user_bob", email: "bob@example.com", name: "Bob Borrower" };
export const CAROL: Who = { subject: "user_carol", email: "carol@example.com", name: "Carol Neighbour" };
export const ADMIN: Who = { subject: "user_admin", email: ADMIN_EMAIL, name: "Ada Admin" };

/** Signs a user in the way the frontend does: identity + `users.ensure`. */
export async function signIn(t: TestInstance, who: Who) {
  const as = t.withIdentity(who);
  const user = await as.mutation(api.users.ensure, {});
  return { as, user, id: user._id as Id<"users"> };
}

export type ToolInput = {
  name: string;
  category: "power_tools" | "hand_tools" | "garden" | "kitchen" | "camping" | "cleaning" | "other";
  condition: "new" | "good" | "fair" | "worn";
  description: string;
};
export const DEFAULT_TOOL: ToolInput = {
  name: "Cordless drill",
  category: "power_tools",
  condition: "good",
  description: "18V with two batteries",
};

export async function createTool(as: AsUser, overrides: Partial<ToolInput> = {}): Promise<Id<"tools">> {
  return await as.mutation(api.tools.create, { ...DEFAULT_TOOL, ...overrides });
}

export async function requestLoan(
  as: AsUser,
  toolId: Id<"tools">,
  startDate = addDays(TODAY, 1),
  endDate = addDays(TODAY, 3),
): Promise<Id<"loans">> {
  return await as.mutation(api.loans.request, { toolId, startDate, endDate });
}

// ---------------------------------------------------------------------------
// Direct reads of the mock database (bypass the API on purpose).
// ---------------------------------------------------------------------------
export async function getTool(t: TestInstance, id: Id<"tools">) {
  return await t.run((ctx) => ctx.db.get(id));
}
export async function getLoan(t: TestInstance, id: Id<"loans">) {
  return await t.run((ctx) => ctx.db.get(id));
}
export async function getUser(t: TestInstance, id: Id<"users">) {
  return await t.run((ctx) => ctx.db.get(id));
}
export async function eventsForLoan(t: TestInstance, loanId: Id<"loans">) {
  return await t.run((ctx) =>
    ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loanId)).collect(),
  );
}
export async function allEvents(t: TestInstance) {
  return await t.run((ctx) => ctx.db.query("automationEvents").collect());
}
export async function eventsByKey(t: TestInstance, idempotencyKey: string) {
  return await t.run((ctx) =>
    ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .collect(),
  );
}
export async function countRows(t: TestInstance, table: "users" | "tools" | "loans" | "automationEvents") {
  return (await t.run((ctx) => ctx.db.query(table).collect())).length;
}

/** Scheduled `internal.automation.deliver` jobs, in scheduling order. */
export async function deliverJobs(t: TestInstance) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs
    .filter((j) => /^automation(\.js|\.ts)?:deliver$/.test(j.name))
    .sort((a, b) => a._creationTime - b._creationTime);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

/** Asserts the promise rejects with `ConvexError({ code, message })`. */
export async function expectConvexError(p: Promise<unknown>, code: ErrorCode, label = ""): Promise<unknown> {
  let threw = false;
  let err: unknown;
  try {
    await p;
  } catch (e) {
    threw = true;
    err = e;
  }
  const where = label ? `${label}: ` : "";
  expect(threw, `${where}expected ConvexError ${code}, but the call succeeded`).toBe(true);
  const data = (err as { data?: unknown } | undefined)?.data;
  const actual =
    typeof data === "object" && data !== null ? (data as { code?: unknown }).code : undefined;
  expect(
    actual,
    `${where}expected ConvexError code ${code}, got: ${err instanceof Error ? err.message : String(err)}`,
  ).toBe(code);
  expect(typeof (data as { message?: unknown }).message, `${where}ConvexError data.message must be a string`).toBe(
    "string",
  );
  return err;
}

// ---------------------------------------------------------------------------
// HMAC reference implementation (independent of convex/lib/hmac.ts on purpose)
// ---------------------------------------------------------------------------
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function referenceSign(secret: string, timestamp: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`));
  return `sha256=${toHex(mac)}`;
}

/** Headers n8n sends to Convex. GET requests sign the empty body. */
export async function signedHeaders(
  body: string,
  opts: { secret?: string; timestamp?: number } = {},
): Promise<Record<string, string>> {
  const ts = String(opts.timestamp ?? Date.now());
  return {
    "X-LendLoop-Timestamp": ts,
    "X-LendLoop-Signature": await referenceSign(opts.secret ?? N8N_TO_CONVEX_SECRET, ts, body),
  };
}

// ---------------------------------------------------------------------------
// Function introspection: lets RBAC tests sweep EVERY exported Convex function,
// including ones added after this suite was written.
// ---------------------------------------------------------------------------
export type ValidatorJson = {
  type: string;
  value?: unknown;
  tableName?: string;
};
type RegisteredFn = {
  isPublic?: boolean;
  isInternal?: boolean;
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  exportArgs?: () => string;
};
export type ConvexFn = {
  path: string; // e.g. "tools:create"
  module: string; // e.g. "tools"
  name: string; // e.g. "create"
  kind: "query" | "mutation" | "action";
  visibility: "public" | "internal";
  args: ValidatorJson;
};

export async function loadConvexFunctions(): Promise<ConvexFn[]> {
  const out: ConvexFn[] = [];
  for (const [file, load] of Object.entries(modules)) {
    if (file.startsWith("./_generated/") || file === "./schema.ts") continue;
    const moduleName = file.replace(/^\.\//, "").replace(/\.(ts|js|mts|mjs)$/, "");
    const mod = (await load()) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== "function") continue;
      const fn = value as RegisteredFn;
      const kind = fn.isQuery ? "query" : fn.isMutation ? "mutation" : fn.isAction ? "action" : null;
      if (!kind) continue;
      if (!fn.isPublic && !fn.isInternal) continue;
      const args = JSON.parse(fn.exportArgs ? fn.exportArgs() : '{"type":"any"}') as ValidatorJson;
      out.push({
        path: `${moduleName}:${name}`,
        module: moduleName,
        name,
        kind,
        visibility: fn.isPublic ? "public" : "internal",
        args,
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Builds a validator-satisfying argument value; ids come from real seeded rows. */
export function sampleValue(v: ValidatorJson, ids: Record<string, string>): unknown {
  switch (v.type) {
    case "object": {
      const fields = (v.value ?? {}) as Record<string, { fieldType: ValidatorJson; optional: boolean }>;
      const obj: Record<string, unknown> = {};
      for (const [k, f] of Object.entries(fields)) {
        if (!f.optional) obj[k] = sampleValue(f.fieldType, ids);
      }
      return obj;
    }
    case "id": {
      const id = ids[v.tableName ?? ""];
      if (!id) throw new Error(`No seeded id for table ${v.tableName}`);
      return id;
    }
    case "string":
      return "sample";
    case "number":
      return 1;
    case "bigint":
      return BigInt(1);
    case "boolean":
      return true;
    case "null":
      return null;
    case "literal":
      return v.value;
    case "union":
      return sampleValue((v.value as ValidatorJson[])[0], ids);
    case "array":
      return [];
    case "record":
      return {};
    case "any":
      return {};
    default:
      return null;
  }
}

export function sampleArgs(fn: ConvexFn, ids: Record<string, string>): Record<string, unknown> {
  const value = sampleValue(fn.args, ids);
  return (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
}

/** Calls any function by path with untyped args (used only by sweeps). */
export async function callByPath(
  t: TestInstance | AsUser,
  fn: ConvexFn,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (fn.kind === "query") {
    const ref = makeFunctionReference<"query">(fn.path) as FunctionReference<"query", "public", Record<string, unknown>>;
    return await t.query(ref, args);
  }
  if (fn.kind === "mutation") {
    const ref = makeFunctionReference<"mutation">(fn.path) as FunctionReference<
      "mutation",
      "public",
      Record<string, unknown>
    >;
    return await t.mutation(ref, args);
  }
  const ref = makeFunctionReference<"action">(fn.path) as FunctionReference<"action", "public", Record<string, unknown>>;
  return await t.action(ref, args);
}

/** One row in each table so `v.id(...)` args can be satisfied. */
export async function seedOneOfEach(t: TestInstance): Promise<Record<string, string>> {
  return await t.run(async (ctx) => {
    const users = await ctx.db.insert("users", {
      clerkId: "seed_owner",
      name: "Seed Owner",
      email: "seed-owner@example.com",
      role: "user",
      trustedLender: false,
    });
    const borrower = await ctx.db.insert("users", {
      clerkId: "seed_borrower",
      name: "Seed Borrower",
      email: "seed-borrower@example.com",
      role: "user",
      trustedLender: false,
    });
    const tools = await ctx.db.insert("tools", {
      ownerId: users,
      name: "Seed ladder",
      category: "other",
      condition: "good",
      description: "",
      status: "available",
      createdAt: Date.now(),
    });
    const loans = await ctx.db.insert("loans", {
      toolId: tools,
      borrowerId: borrower,
      lenderId: users,
      startDate: addDays(TODAY, 1),
      endDate: addDays(TODAY, 2),
      status: "pending",
      createdAt: Date.now(),
    });
    const automationEvents = await ctx.db.insert("automationEvents", {
      loanId: loans,
      kind: "request_notification",
      idempotencyKey: `${loans}:loan.requested`,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    });
    return { users, tools, loans, automationEvents };
  });
}

/** The client-callable surface defined in CONTRACT.md. */
export const CONTRACT_PUBLIC: ReadonlyArray<{ path: string; kind: "query" | "mutation" }> = [
  { path: "tools:listPublic", kind: "query" },
  { path: "tools:list", kind: "query" },
  { path: "tools:listMine", kind: "query" },
  { path: "tools:create", kind: "mutation" },
  { path: "tools:update", kind: "mutation" },
  { path: "tools:remove", kind: "mutation" },
  { path: "loans:request", kind: "mutation" },
  { path: "loans:cancel", kind: "mutation" },
  { path: "loans:approve", kind: "mutation" },
  { path: "loans:decline", kind: "mutation" },
  { path: "loans:markReturned", kind: "mutation" },
  { path: "loans:listMine", kind: "query" },
  { path: "loans:listIncoming", kind: "query" },
  { path: "users:ensure", kind: "mutation" },
  { path: "users:me", kind: "query" },
  { path: "admin:listAllLoans", kind: "query" },
  { path: "admin:listTools", kind: "query" },
  { path: "admin:listUsers", kind: "query" },
  { path: "admin:listAutomationEvents", kind: "query" },
  { path: "admin:removeListing", kind: "mutation" },
  { path: "admin:setTrustedLender", kind: "mutation" },
];

/** The only function a guest may call. */
export const PUBLIC_WITHOUT_AUTH = new Set(["tools:listPublic"]);
