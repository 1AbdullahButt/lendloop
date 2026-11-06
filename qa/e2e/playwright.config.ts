import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// End-to-end run of the kit's manual checklist ("KICKOFF section 4", not in this repo) against the real stack: Clerk dev instance, Convex dev
// deployment, n8n in Docker. Users are signed in with @clerk/testing (sign-in tokens from the
// Clerk secret key), so no passwords or codes are typed.
//   npx playwright test --config qa/e2e/playwright.config.ts
//
// The config is evaluated in the runner and in every worker, so loading .env.local here gives
// both clerkSetup() and clerk.signIn() the Clerk keys. Values are never logged.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: ".",
  testMatch: /kickoff\.spec\.ts$/,
  globalSetup: "./global-setup.ts",
  timeout: 300_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    // A missing element should fail in seconds, not wait for the 5-minute test timeout.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    ...devices["Desktop Chrome"],
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
