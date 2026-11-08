// Security headers: the CSP additions given to Clerk's middleware and the static headers. The
// live checks (curl -I, zero violations in the browser) are in SECURITY.md.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CSP_DIRECTIVES, STATIC_HEADERS, cspDirectives, cspReportOnly } from "../../lib/securityHeaders";

describe("CSP directives", () => {
  test("never framed, no plugins, no <base> or form posts elsewhere", () => {
    expect(CSP_DIRECTIVES["frame-ancestors"]).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES["object-src"]).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES["base-uri"]).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES["form-action"]).toEqual(["'self'"]);
  });

  test("allows exactly the services the browser talks to: Convex (incl. websocket) and Clerk", () => {
    expect(CSP_DIRECTIVES["connect-src"]).toEqual([
      "https://*.convex.cloud",
      "wss://*.convex.cloud",
      "https://*.clerk.accounts.dev",
      "https://clerk.com",
    ]);
    expect(CSP_DIRECTIVES["font-src"]).toEqual(["'self'"]);
  });

  test("scripts are left to Clerk's strict mode (nonce + 'strict-dynamic'), never unsafe-eval or a wildcard", () => {
    const all = Object.values(CSP_DIRECTIVES).flat();
    expect(all).not.toContain("'unsafe-eval'");
    expect(all).not.toContain("*");
    expect(Object.keys(CSP_DIRECTIVES)).not.toContain("script-src");
  });

  test("cspDirectives() is a fresh copy", () => {
    const copy = cspDirectives();
    copy["connect-src"].push("https://evil.example");
    expect(CSP_DIRECTIVES["connect-src"]).not.toContain("https://evil.example");
  });

  test("report-only only when CSP_REPORT_ONLY=1", () => {
    expect(cspReportOnly({})).toBe(false);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "0" })).toBe(false);
    expect(cspReportOnly({ CSP_REPORT_ONLY: "1" })).toBe(true);
  });
});

describe("static headers and wiring", () => {
  test("referrer, nosniff, permissions and frame options", () => {
    const h = Object.fromEntries(STATIC_HEADERS.map((x) => [x.key, x.value]));
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(h["Permissions-Policy"]).toContain(`${feature}=()`);
    }
  });

  test("middleware uses Clerk's strict CSP; next.config sends the static headers; ClerkProvider reads the nonce", () => {
    expect(readFileSync("middleware.ts", "utf8")).toMatch(/contentSecurityPolicy:\s*\{\s*strict:\s*true,\s*directives:\s*cspDirectives\(\)/);
    expect(readFileSync("next.config.ts", "utf8")).toMatch(/headers:\s*STATIC_HEADERS/);
    expect(readFileSync("app/layout.tsx", "utf8")).toMatch(/<ClerkProvider[\s\S]*?\bdynamic\b/);
  });
});
