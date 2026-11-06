#!/usr/bin/env node
// Sends LendLoop-signed test requests, using the same scheme as convex/lib/hmac.ts:
//   X-LendLoop-Signature = "sha256=" + hex(HMAC-SHA256(secret, timestamp + "." + rawBody))
// Secrets are read from the environment only. Load them from the git-ignored file with:
//   node --env-file=n8n/.env n8n/scripts/signed-request.mjs <command> ...
//
// Commands:
//   notify <webhookUrl> [--type loan.requested] [--bad-signature | --stale | --unsigned]
//       POST a sample notification to the n8n request-notification webhook
//       (secret CONVEX_TO_N8N_SECRET). Expect 200, or 401 with the flags.
//   overdue
//       Signed GET $CONVEX_SITE_URL/n8n/overdue-loans (secret N8N_TO_CONVEX_SECRET).
//       Emails in the response are masked before printing.
//   reminder-status <loanId> <idempotencyKey> [sent|failed]
//       Signed POST $CONVEX_SITE_URL/n8n/reminder-status. Run twice to see idempotency.
import { createHmac, randomUUID } from "node:crypto";

const FIVE_MINUTES = 5 * 60 * 1000;

function sign(secret, timestamp, body) {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Run with: node --env-file=n8n/.env n8n/scripts/signed-request.mjs ...`);
    process.exit(2);
  }
  return value;
}

function maskEmails(text) {
  return text.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@/g, "$1***@");
}

function signedHeaders(secret, body, flags) {
  if (flags.has("--unsigned")) return {};
  const timestamp = String(flags.has("--stale") ? Date.now() - FIVE_MINUTES - 60_000 : Date.now());
  let signature = sign(secret, timestamp, body);
  if (flags.has("--bad-signature")) signature = sign(`${secret}-wrong`, timestamp, body);
  return { "X-LendLoop-Timestamp": timestamp, "X-LendLoop-Signature": signature };
}

async function send(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`${init.method} ${new URL(url).pathname} -> ${res.status}`);
  if (text) console.log(maskEmails(text));
}

function argValue(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

async function notify(args, flags) {
  const url = args[0];
  if (!url) throw new Error("usage: notify <webhookUrl> [--type loan.requested] [--bad-signature|--stale|--unsigned]");
  const secret = requireEnv("CONVEX_TO_N8N_SECRET");
  // Shape matches SPEC 6.1; the address is a placeholder on the reserved example.com domain.
  const body = JSON.stringify({
    eventId: `test-${randomUUID()}`,
    type: argValue(args, "--type", "loan.requested"),
    loanId: "test-loan",
    toolName: "Cordless drill",
    recipientName: "Test Neighbour",
    recipientEmail: "neighbour@example.com",
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    sentAt: Date.now(),
  });
  await send(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signedHeaders(secret, body, flags) },
    body,
  });
}

async function overdue(flags) {
  const site = requireEnv("CONVEX_SITE_URL");
  const secret = requireEnv("N8N_TO_CONVEX_SECRET");
  await send(`${site}/n8n/overdue-loans`, { method: "GET", headers: signedHeaders(secret, "", flags) });
}

async function reminderStatus(args, flags) {
  const [loanId, idempotencyKey, status = "sent"] = args;
  if (!loanId || !idempotencyKey) throw new Error("usage: reminder-status <loanId> <idempotencyKey> [sent|failed]");
  const site = requireEnv("CONVEX_SITE_URL");
  const secret = requireEnv("N8N_TO_CONVEX_SECRET");
  const payload = { idempotencyKey, loanId, status };
  if (status === "failed") payload.error = "manual test";
  const body = JSON.stringify(payload);
  await send(`${site}/n8n/reminder-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...signedHeaders(secret, body, flags) },
    body,
  });
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--") && a !== "--type"));
const args = rest.filter((a) => !flags.has(a));

const commands = {
  notify: () => notify(args, flags),
  overdue: () => overdue(flags),
  "reminder-status": () => reminderStatus(args, flags),
};

if (!commands[command]) {
  console.error("commands: notify <webhookUrl> | overdue | reminder-status <loanId> <idempotencyKey> [sent|failed]");
  process.exit(2);
}
commands[command]().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
