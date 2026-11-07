// Creates (or renames) LendLoop's US test users in your Clerk *development* instance with the
// Backend API, then seeds the three demo neighbors and their tools in Convex.
//
//   node scripts/clerk-test-users.mjs          # seeds the dev deployment
//   node scripts/clerk-test-users.mjs --prod   # seeds the Convex production deployment instead
//
// Reads CLERK_SECRET_KEY from .env.local and never prints it. Every address is
// <name>+clerk_test@example.com: Clerk treats "+clerk_test" addresses as test users (no real
// email is sent; the verification code is 424242), so these accounts can't reach anyone.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const key = process.env.CLERK_SECRET_KEY;
if (!key) {
  console.error("CLERK_SECRET_KEY is not set (expected in .env.local).");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: this script only creates users in a Clerk development instance (sk_test_ key).");
  process.exit(1);
}

const API = "https://api.clerk.com/v1";
const USERS = [
  { key: "ben", first: "Ben", last: "Carter", role: "lender in the e2e run, owns 3 seed tools" },
  { key: "maya", first: "Maya", last: "Rodriguez", role: "borrower in the e2e run" },
  { key: "marcus", first: "Marcus", last: "Davis", role: "seed neighbor" },
  { key: "olivia", first: "Olivia", last: "Parker", role: "seed neighbor" },
  { key: "jake", first: "Jake", last: "Thompson", role: "seed neighbor" },
].map((u) => ({ ...u, email: `${u.key}+clerk_test@example.com` }));

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

const ids = {};
for (const u of USERS) {
  const found = await clerk("GET", `/users?email_address=${encodeURIComponent(u.email)}`);
  let user;
  let action;
  if (Array.isArray(found) && found.length > 0) {
    user = await clerk("PATCH", `/users/${found[0].id}`, { first_name: u.first, last_name: u.last });
    action = "updated";
  } else {
    user = await clerk("POST", "/users", {
      email_address: [u.email],
      first_name: u.first,
      last_name: u.last,
      skip_password_requirement: true,
    });
    action = "created";
  }
  ids[u.key] = user.id;
  console.log(`${u.first} ${u.last.charAt(0)}. (${u.role}): ${action} ${user.id}`);
}

// Link the seeded people's Convex rows to their Clerk ids, so signing in as one of them later
// reuses the seeded row (and its tools) instead of creating a second user.
const prod = process.argv.includes("--prod");
const args = JSON.stringify({ clerkIds: { ben: ids.ben, marcus: ids.marcus, olivia: ids.olivia, jake: ids.jake } });
const out = execSync(`npx convex run${prod ? " --prod" : ""} seed:neighbors "${args.replace(/"/g, '\\"')}"`, {
  encoding: "utf8",
});
console.log(`Convex seed (${prod ? "production" : "dev"}): ${out.trim().replace(/\s+/g, " ")}`);
