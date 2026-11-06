// AC3: signed-out visits to protected routes end on the app's own /sign-in page
// (docs/DECISIONS.md). The middleware is a convenience; Convex enforces again (AC4).
import { expect, test } from "@playwright/test";

const PROTECTED = ["/tools", "/my/listings", "/my/requests", "/my/incoming", "/admin"];

test.describe("AC3: auth gate", () => {
  for (const path of PROTECTED) {
    test(`AC3: signed-out visit to ${path} redirects to /sign-in`, async ({ page, baseURL }) => {
      await page.goto(path);
      // Clerk may bounce through its handshake before landing; wait for the final page.
      await page.waitForURL((url) => url.pathname.startsWith("/sign-in"), { timeout: 20_000 });
      const final = new URL(page.url());
      expect(final.pathname.startsWith("/sign-in")).toBe(true);
      expect(final.origin).toBe(new URL(baseURL ?? "http://localhost:3000").origin);
    });
  }
});
