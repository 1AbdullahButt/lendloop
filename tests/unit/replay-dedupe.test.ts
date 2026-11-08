// Replay protection in n8n: a second signed delivery of the same eventId sends nothing and is
// logged as a duplicate. Runs the two Code nodes' real code from the exported workflow with a
// fake n8n context (static data, $input, $env, fs), and checks how they are wired.
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

type N8nNode = { name: string; parameters: { jsCode?: string } };
type Item = { json: Record<string, unknown> };
const wf = JSON.parse(readFileSync("n8n/workflows/request-notification.json", "utf8")) as {
  nodes: N8nNode[];
  connections: Record<string, { main: { node: string }[][] }>;
};
const code = (name: string) => wf.nodes.find((n) => n.name === name)!.parameters.jsCode!;

function n8n(store: Record<string, unknown>) {
  const outbox: Record<string, unknown>[] = [];
  const fs = { appendFileSync: (_path: string, line: string) => outbox.push(JSON.parse(line)) };
  const run = (name: string, items: Item[]): Item[] =>
    new Function("$input", "$getWorkflowStaticData", "$env", "require", code(name))(
      { first: () => items[0], all: () => items },
      () => store,
      { LENDLOOP_MOCK_OUTBOX: "/tmp/outbox" },
      (mod: string) => (mod === "fs" ? fs : undefined),
    );
  return { outbox, check: (item: Item) => run("Drop duplicate eventId", [item])[0].json, remember: (items: Item[]) => run("Remember eventId", items) };
}

const delivery = (eventId: string): Item => ({ json: { valid: true, eventId, type: "loan.requested", toolName: "Drill" } });

describe("Drop duplicate eventId + Remember eventId", () => {
  test("the second delivery of a sent eventId is dropped and logged as a duplicate", () => {
    const store = {};
    const { check, remember, outbox } = n8n(store);
    const first = check(delivery("evt-1"));
    expect(first).toMatchObject({ duplicate: false, eventId: "evt-1", toolName: "Drill" });
    remember([{ json: first }]);
    const second = check(delivery("evt-1"));
    expect(second).toEqual({ eventId: "evt-1", type: "loan.requested", duplicate: true });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ channel: "request-notification", duplicate: true, eventId: "evt-1" });
    expect(check(delivery("evt-2")).duplicate).toBe(false);
  });

  test("a delivery whose send failed (never remembered) can be retried", () => {
    const { check } = n8n({});
    expect(check(delivery("evt-3")).duplicate).toBe(false);
    expect(check(delivery("evt-3")).duplicate).toBe(false);
  });

  test("ids are forgotten after 24 h and capped at 5000", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 9, 0, 0));
    const store: { sentEventIds?: Record<string, number> } = {};
    const { check, remember } = n8n(store);
    remember([delivery("old")]);
    vi.setSystemTime(Date.UTC(2026, 10, 10, 0, 1));
    expect(check(delivery("old")).duplicate).toBe(false);
    remember(Array.from({ length: 5001 }, (_, i) => delivery(`id-${i}`)));
    expect(Object.keys(store.sentEventIds!).length).toBeLessThanOrEqual(5000);
    vi.useRealTimers();
  });
});

describe("wiring", () => {
  const to = (from: string, out = 0) => wf.connections[from].main[out].map((c) => c.node);
  test("verified requests are checked for duplicates before routing", () => {
    expect(to("Signature valid?", 0)).toEqual(["Drop duplicate eventId"]);
    expect(to("Drop duplicate eventId")).toEqual(["New delivery?"]);
    expect(to("New delivery?", 0)).toEqual(["Route by type"]);
    expect(to("New delivery?", 1)).toEqual(["Respond 200 (duplicate)"]);
  });
  test("an eventId is remembered only after the send succeeded", () => {
    expect(to("Send (mock outbox)")).toEqual(["Remember eventId"]);
    expect(to("Remember eventId")).toEqual(["Respond 200"]);
  });
});
