// The tunnel's only door into n8n: the edge proxy passes webhooks and the health check and
// nothing else, the tunnel points at it, and the n8n editor is published on localhost only.
// (The live check, 404s for /signin and /home/workflows through the tunnel, is in SECURITY.md.)
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const nginx = readFileSync("n8n/edge/nginx.conf", "utf8").replace(/#.*$/gm, "");
const compose = readFileSync("docker-compose.yml", "utf8").replace(/#.*$/gm, "");

const locations = [...nginx.matchAll(/location\s+([^{]+?)\s*\{([^}]*)\}/g)].map((m) => ({ match: m[1].trim(), body: m[2] }));

describe("edge proxy (n8n/edge/nginx.conf)", () => {
  test("exactly three locations: a 404 default, /healthz and /webhook/", () => {
    expect(locations.map((l) => l.match).sort()).toEqual(["/", "= /healthz", "^~ /webhook/"]);
  });
  test("the default answers 404 and proxies nothing", () => {
    const fallback = locations.find((l) => l.match === "/")!;
    expect(fallback.body).toMatch(/return\s+404/);
    expect(fallback.body).not.toMatch(/proxy_pass/);
  });
  test("only /healthz and /webhook/ reach n8n; the editor's /webhook-test/ does not", () => {
    const proxied = locations.filter((l) => /proxy_pass\s+http:\/\/n8n:5678/.test(l.body)).map((l) => l.match);
    expect(proxied.sort()).toEqual(["= /healthz", "^~ /webhook/"]);
    expect(nginx).not.toMatch(/webhook-test|\/rest|\/signin|\/home/);
  });
});

describe("docker-compose wiring", () => {
  test("the tunnel points at the proxy, never at n8n", () => {
    expect(compose).toMatch(/--url http:\/\/edge:80/);
    expect(compose).not.toMatch(/--url http:\/\/n8n:5678/);
  });
  test("the n8n editor is published on 127.0.0.1 only", () => {
    expect(compose).toMatch(/"127\.0\.0\.1:5678:5678"/);
    expect(compose).not.toMatch(/-\s*"5678:5678"/);
  });
});
