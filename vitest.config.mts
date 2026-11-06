import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs Convex functions in the same edge runtime Convex uses.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["tests/**/*.test.ts", "convex/**/*.test.ts"],
    exclude: ["node_modules/**", "tests/acceptance/e2e/**"],
  },
});
