// Error text shown to admins never carries an address: reminder errors written back by n8n and
// network errors from outbound delivery have email-shaped text replaced before storage.
import { expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import { redactEmails } from "../../convex/lib/redact";
import {
  ALICE,
  BOB,
  TODAY,
  allEvents,
  createTool,
  eventsByKey,
  newTest,
  requestLoan,
  signIn,
  useLendLoopEnv,
} from "../acceptance/_helpers";

useLendLoopEnv();

test("redactEmails replaces every address and keeps the rest", () => {
  expect(redactEmails("550 <maya.r+x@example.com>: no such user; cc ben@example.com")).toBe(
    "550 <[redacted-email]>: no such user; cc [redacted-email]",
  );
  expect(redactEmails("SMTP timeout")).toBe("SMTP timeout");
});

test("a failed reminder's error is stored without the address", async () => {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  const loanId = await requestLoan(bob.as, await createTool(alice.as));
  const key = `${loanId}:${TODAY}`;
  await t.mutation(internal.automation.recordReminderStatus, {
    idempotencyKey: key,
    loanId,
    status: "failed",
    error: "550 mailbox bob@example.com unavailable",
  });
  const [row] = await eventsByKey(t, key);
  expect(row.lastError).toBe("550 mailbox [redacted-email] unavailable");
});

test("an outbound network error is stored without the address", async () => {
  const t = newTest();
  const alice = await signIn(t, ALICE);
  const bob = await signIn(t, BOB);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("relay refused alice@example.com");
    }),
  );
  await requestLoan(bob.as, await createTool(alice.as));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const [ev] = await allEvents(t);
  expect(ev.status).toBe("failed");
  expect(ev.lastError).not.toContain("@");
  expect(ev.lastError).toContain("[redacted-email]");
});
