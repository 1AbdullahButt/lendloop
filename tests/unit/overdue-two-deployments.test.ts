// Overdue reminders cover both Convex deployments: the workflow's real Code nodes run with a fake
// n8n context. Each deployment's URL comes from $env, each request is signed with that
// deployment's secret, and each result goes back to the deployment its loan came from.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

type Item = { json: Record<string, unknown>; pairedItem?: { item: number } };
type N8nNode = { name: string; type: string; onError?: string; parameters: { jsCode?: string; url?: string } };
const raw = readFileSync("n8n/workflows/overdue-reminders.json", "utf8");
const wf = JSON.parse(raw) as { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }> };
const node = (name: string) => wf.nodes.find((n) => n.name === name)!;

const DEV = "https://dev-example.convex.site";
const PROD = "https://prod-example.convex.site";
const ENV = { CONVEX_SITE_URL: DEV, N8N_TO_CONVEX_SECRET: "dev-test-secret", LENDLOOP_MOCK_OUTBOX: "/tmp/outbox" };

function run(name: string, input: Item[], env: Record<string, string>, nodes: Record<string, Item[]> = {}) {
  const outbox: Record<string, unknown>[] = [];
  const fs = { appendFileSync: (_p: string, line: string) => outbox.push(JSON.parse(line)) };
  const req = (mod: string) => (mod === "fs" ? fs : mod === "crypto" ? require("node:crypto") : undefined);
  const $ = (n: string) => ({ all: () => nodes[n], first: () => nodes[n][0] });
  const fn = new Function("$input", "$env", "require", "$", node(name).parameters.jsCode!);
  let result: Item[] | undefined;
  let error: Error | undefined;
  try {
    result = fn({ all: () => input, first: () => input[0] }, env, req, $);
  } catch (e) {
    error = e as Error;
  }
  return { result, error, outbox };
}

const hmac = (secret: string, ts: string, body: string) =>
  "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex");

describe("Sign GET overdue-loans", () => {
  test("dev only when CONVEX_SITE_URL_PROD is unset", () => {
    const out = run("Sign GET overdue-loans", [], ENV).result!;
    expect(out.map((i) => i.json.deployment)).toEqual(["dev"]);
  });

  test("dev and prod, each signed with its own secret, URLs from env, no secret on the item", () => {
    const env = { ...ENV, CONVEX_SITE_URL_PROD: `${PROD}/`, N8N_TO_CONVEX_SECRET_PROD: "prod-test-secret" };
    const out = run("Sign GET overdue-loans", [], env).result!.map((i) => i.json);
    expect(out.map((j) => [j.deployment, j.siteUrl])).toEqual([
      ["dev", DEV],
      ["prod", PROD],
    ]);
    expect(out[0].signature).toBe(hmac("dev-test-secret", out[0].timestamp as string, ""));
    expect(out[1].signature).toBe(hmac("prod-test-secret", out[1].timestamp as string, ""));
    for (const j of out) expect(Object.keys(j).sort()).toEqual(["deployment", "signature", "siteUrl", "timestamp"]);
  });

  test("prod falls back to the shared secret", () => {
    const out = run("Sign GET overdue-loans", [], { ...ENV, CONVEX_SITE_URL_PROD: PROD }).result!;
    const prod = out[1].json;
    expect(prod.signature).toBe(hmac("dev-test-secret", prod.timestamp as string, ""));
  });

  test("a missing dev URL or secret stops the run", () => {
    expect(run("Sign GET overdue-loans", [], { N8N_TO_CONVEX_SECRET: "x" }).error?.message).toMatch(/CONVEX_SITE_URL/);
    expect(run("Sign GET overdue-loans", [], { CONVEX_SITE_URL: DEV }).error?.message).toMatch(/N8N_TO_CONVEX_SECRET/);
  });
});

const signed: Item[] = [
  { json: { deployment: "dev", siteUrl: DEV, timestamp: "1", signature: "s" } },
  { json: { deployment: "prod", siteUrl: PROD, timestamp: "1", signature: "s" } },
];
const loan = (id: string) => ({ loanId: id, idempotencyKey: `${id}:2026-11-09`, toolName: "Drill", borrowerName: "Maya", borrowerEmail: "maya@example.com", endDate: "2026-11-01" });

describe("Tag loans by deployment + Alert on failures", () => {
  test("each loan keeps the deployment it came from (same loan id on both stays separate)", () => {
    const responses: Item[] = [
      { json: { statusCode: 200, body: [loan("L1")] }, pairedItem: { item: 0 } },
      { json: { statusCode: 200, body: [loan("L1"), loan("P2")] }, pairedItem: { item: 1 } },
    ];
    const out = run("Tag loans by deployment", responses, ENV, { "Sign GET overdue-loans": signed }).result!;
    expect(out.map((i) => [i.json.deployment, i.json.siteUrl, i.json.idempotencyKey])).toEqual([
      ["dev", DEV, "L1:2026-11-09"],
      ["prod", PROD, "L1:2026-11-09"],
      ["prod", PROD, "P2:2026-11-09"],
    ]);
  });

  test("a failed deployment is skipped for sending, logged and thrown after; a healthy run alerts nothing", () => {
    const responses: Item[] = [
      { json: { statusCode: 200, body: [loan("L1")] }, pairedItem: { item: 0 } },
      { json: { error: { message: "getaddrinfo ENOTFOUND" } }, pairedItem: { item: 1 } },
    ];
    const ctx = { "Sign GET overdue-loans": signed };
    const tagged = run("Tag loans by deployment", responses, ENV, ctx).result!;
    expect(tagged.map((i) => i.json.deployment)).toEqual(["dev"]);

    const alert = run("Alert on failures", responses, ENV, ctx);
    expect(alert.outbox).toEqual([expect.objectContaining({ channel: "overdue-fetch-failed", deployment: "prod" })]);
    expect(alert.error?.message).toMatch(/failed for prod/);

    const fine = run("Alert on failures", [responses[0]], ENV, ctx);
    expect(fine.error).toBeUndefined();
    expect(fine.result).toEqual([]);
  });
});

describe("send and write back to the same deployment", () => {
  test("the outbox line names the deployment; the POST is signed with that deployment's secret", () => {
    const tagged: Item[] = [
      { json: { ...loan("L1"), deployment: "dev", siteUrl: DEV } },
      { json: { ...loan("P2"), deployment: "prod", siteUrl: PROD } },
    ];
    const sent = run("Send reminder (mock outbox)", tagged, ENV);
    expect(sent.outbox.map((e) => e.deployment)).toEqual(["dev", "prod"]);
    expect(JSON.stringify(sent.outbox)).not.toContain("maya@example.com");

    const env = { ...ENV, CONVEX_SITE_URL_PROD: PROD, N8N_TO_CONVEX_SECRET_PROD: "prod-test-secret" };
    const posts = run("Sign POST reminder-status", sent.result!, env).result!.map((i) => i.json);
    expect(posts.map((p) => p.siteUrl)).toEqual([DEV, PROD]);
    expect(posts[0].signature).toBe(hmac("dev-test-secret", posts[0].timestamp as string, posts[0].body as string));
    expect(posts[1].signature).toBe(hmac("prod-test-secret", posts[1].timestamp as string, posts[1].body as string));
    expect(JSON.parse(posts[1].body as string)).toEqual({ idempotencyKey: "P2:2026-11-09", loanId: "P2", status: "sent" });
  });
});

describe("wiring", () => {
  test("both HTTP calls use the item's siteUrl; no host is written into the workflow", () => {
    expect(node("GET overdue loans").parameters.url).toBe("={{ $json.siteUrl }}/n8n/overdue-loans");
    expect(node("POST reminder status").parameters.url).toBe("={{ $json.siteUrl }}/n8n/reminder-status");
    expect(raw).not.toMatch(/\.convex\.(site|cloud)/);
  });

  test("one deployment failing doesn't stop the other; the alert runs on the same responses", () => {
    expect(node("GET overdue loans").onError).toBe("continueRegularOutput");
    expect(wf.connections["GET overdue loans"].main[0].map((c) => c.node)).toEqual(["Tag loans by deployment", "Alert on failures"]);
  });

  test("each loan is sent and written back before the next; a failed write-back doesn't stop the loop", () => {
    const next = (n: string, out = 0) => wf.connections[n].main[out].map((c) => c.node);
    expect(next("Tag loans by deployment")).toEqual(["One at a time"]);
    expect(next("One at a time", 1)).toEqual(["Send reminder (mock outbox)"]);
    expect(next("Send reminder (mock outbox)")).toEqual(["Sign POST reminder-status"]);
    expect(next("Sign POST reminder-status")).toEqual(["POST reminder status"]);
    expect(next("POST reminder status")).toEqual(["Record write-back result"]);
    expect(next("Record write-back result")).toEqual(["One at a time"]);
    expect(next("One at a time", 0)).toEqual(["Check write-backs"]);
    expect(node("POST reminder status").onError).toBe("continueRegularOutput");
    // The alert sits below the reminders branch, so it runs after the loop has finished.
    const y = (n: string) => (wf.nodes.find((x) => x.name === n) as unknown as { position: number[] }).position[1];
    expect(y("Alert on failures")).toBeGreaterThan(y("Tag loans by deployment"));
  });
});

describe("write-back failures", () => {
  const signedPost = (id: string, deployment: string) => ({
    json: { deployment, siteUrl: DEV, timestamp: "1", signature: "s", body: JSON.stringify({ idempotencyKey: `${id}:2026-11-09`, loanId: id, status: "sent" }) },
  });

  test("Record write-back result names the loan, ok or failed", () => {
    const ok = run("Record write-back result", [{ json: { ok: true } }], ENV, { "Sign POST reminder-status": [signedPost("L1", "dev")] });
    expect(ok.result!.map((i) => i.json)).toEqual([
      { deployment: "dev", loanId: "L1", idempotencyKey: "L1:2026-11-09", reminder: "sent", writeBack: "ok" },
    ]);
    const bad = run("Record write-back result", [{ json: { error: { message: "502 Bad Gateway" } } }], ENV, {
      "Sign POST reminder-status": [signedPost("P2", "prod")],
    });
    expect(bad.result![0].json).toMatchObject({ deployment: "prod", loanId: "P2", writeBack: "failed", error: "502 Bad Gateway" });
  });

  test("Check write-backs logs only the failed ones; the alert throws once for them, after the run", () => {
    const results: Item[] = [
      { json: { deployment: "dev", loanId: "L1", writeBack: "ok", reminder: "sent" } },
      { json: { deployment: "prod", loanId: "P2", writeBack: "failed", reminder: "sent", error: "502" } },
    ];
    const checked = run("Check write-backs", results, ENV);
    expect(checked.outbox).toEqual([expect.objectContaining({ channel: "overdue-writeback-failed", deployment: "prod", loanId: "P2" })]);
    expect(checked.result!.map((i) => i.json.loanId)).toEqual(["P2"]);

    const healthyFetch: Item[] = [{ json: { statusCode: 200, body: [] }, pairedItem: { item: 0 } }];
    const alert = run("Alert on failures", healthyFetch, ENV, { "Sign GET overdue-loans": signed, "Check write-backs": checked.result! });
    expect(alert.error?.message).toMatch(/write-back failed for P2 on prod/);
    expect(alert.outbox).toEqual([]);

    // No overdue loans: the loop and "Check write-backs" never ran, and nothing is alerted.
    const quiet = run("Alert on failures", healthyFetch, ENV, { "Sign GET overdue-loans": signed });
    expect(quiet.error).toBeUndefined();
    expect(quiet.result).toEqual([]);
  });
});
