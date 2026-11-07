// Gives the five demo accounts a simple sign-in in your Clerk *development* instance:
// a second email address (<name>_test@example.com), verified and made primary, and one password
// you type for all five. The +clerk_test address stays on each account, so the e2e run, which
// signs in by it, keeps working.
//
//   node scripts/clerk-demo-logins.mjs           # asks for the password, then updates Clerk
//   node scripts/clerk-demo-logins.mjs --check   # read-only: shows each account's state
//
// Reads CLERK_SECRET_KEY from .env.local and refuses anything but an sk_test_ key. The password
// is read from the terminal with hidden input and sent only to Clerk. It is never printed,
// written to a file or put in an env var. Run scripts/clerk-test-users.mjs first.
import { existsSync } from "node:fs";

const CHECK_ONLY = process.argv.includes("--check");

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const key = process.env.CLERK_SECRET_KEY;
if (!key) fail("CLERK_SECRET_KEY is not set (expected in .env.local).");
if (!key.startsWith("sk_test_")) {
  fail("Refusing to run: this script only changes users in a Clerk development instance (sk_test_ key).");
}

const API = "https://api.clerk.com/v1";
const ACCOUNTS = [
  { key: "ben", name: "Ben Carter" },
  { key: "maya", name: "Maya Rodriguez" },
  { key: "marcus", name: "Marcus Davis" },
  { key: "olivia", name: "Olivia Parker" },
  { key: "jake", name: "Jake Thompson" },
].map((a) => ({ ...a, legacy: `${a.key}+clerk_test@example.com`, login: `${a.key}_test@example.com` }));

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Clerk Backend API call. Errors carry Clerk's message, never the request body. */
async function clerk(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = json?.errors?.map((e) => e.long_message ?? e.message).join("; ") ?? res.statusText;
    throw new Error(`${method} ${path.split("?")[0]} -> ${res.status}: ${detail}`);
  }
  return json;
}

const byEmail = async (email) => clerk("GET", `/users?email_address=${encodeURIComponent(email)}`);
const addressOf = (user, email) => user.email_addresses.find((e) => e.email_address.toLowerCase() === email);

/** Reads a line from the terminal without echoing it. */
function askHidden(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let value = "";
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          finish();
          process.exit(130); // Ctrl+C: nothing has been changed yet
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    }
    stdin.on("data", onData);
  });
}

function describe(a, user) {
  const login = addressOf(user, a.login);
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id)?.email_address;
  return [
    `${a.name.split(" ")[0]} ${a.name.split(" ")[1][0]}.`.padEnd(10),
    `primary ${primary ?? "-"}`.padEnd(40),
    `${a.login} ${login ? (login.verification?.status === "verified" ? "verified" : "UNVERIFIED") : "missing"}`.padEnd(40),
    `+clerk_test ${addressOf(user, a.legacy) ? "kept" : "MISSING"}`.padEnd(20),
    `password ${user.password_enabled ? "set" : "not set"}`,
  ].join(" ");
}

// Find every account (by its +clerk_test address) before changing anything.
const found = [];
for (const a of ACCOUNTS) {
  const [user] = await byEmail(a.legacy);
  if (!user) fail(`${a.name}: no Clerk user with ${a.legacy}. Run node scripts/clerk-test-users.mjs first.`);
  const [holder] = await byEmail(a.login);
  if (holder && holder.id !== user.id) fail(`${a.login} already belongs to another Clerk user (${holder.id}). Nothing changed.`);
  found.push({ a, user });
}

if (CHECK_ONLY) {
  for (const { a, user } of found) console.log(describe(a, user));
  process.exit(0);
}

if (!process.stdin.isTTY) {
  fail("Run this in an interactive terminal (PowerShell or Windows Terminal), so the password can be typed hidden.");
}

console.log("One password for all five demo accounts. Clerk enforces its own rules (this instance:");
console.log("at least 15 characters, and not a known breached password). Input is hidden.");
const password = await askHidden("Password: ");
if (!password) fail("No password entered. Nothing changed.");
if ((await askHidden("Again:    ")) !== password) fail("The passwords don't match. Nothing changed.");

// Passwords first: if Clerk rejects it (too short, breached), it does so for the first account
// before any email address changes.
for (const [i, { a, user }] of found.entries()) {
  try {
    await clerk("PATCH", `/users/${user.id}`, { password });
  } catch (err) {
    fail(`${a.name}: password not set. ${err.message}${i === 0 ? " Nothing changed." : ""}`);
  }
}

for (const { a, user } of found) {
  const existing = addressOf(user, a.login);
  if (!existing) {
    await clerk("POST", "/email_addresses", { user_id: user.id, email_address: a.login, verified: true, primary: true });
  } else {
    if (existing.verification?.status !== "verified") {
      await clerk("PATCH", `/email_addresses/${existing.id}`, { verified: true });
    }
    if (user.primary_email_address_id !== existing.id) {
      await clerk("PATCH", `/email_addresses/${existing.id}`, { primary: true });
    }
  }
}

// Read everything back, including the lookup the e2e run uses.
console.log("");
let ok = true;
for (const { a } of found) {
  const [user] = await byEmail(a.legacy);
  if (!user) {
    ok = false;
    console.log(`FAIL ${a.name}: no longer found by ${a.legacy}, so the e2e sign-in would break.`);
    continue;
  }
  const login = addressOf(user, a.login);
  const good = Boolean(
    user && login && user.primary_email_address_id === login.id && login.verification?.status === "verified" && user.password_enabled,
  );
  ok &&= good;
  console.log(`${good ? "ok  " : "FAIL"} ${describe(a, user)}`);
}
console.log(ok ? "\nDone. Sign in with <name>_test@example.com and the password you just typed." : "\nSome accounts are not set up; see FAIL above.");
process.exit(ok ? 0 : 1);
