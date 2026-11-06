import { clerkSetup } from "@clerk/testing/playwright";

// Fetches a Clerk testing token (bypasses bot protection on the dev instance). Keys come from
// .env.local, loaded by playwright.config.ts; nothing here prints them.
export default async function globalSetup(): Promise<void> {
  await clerkSetup();
}
