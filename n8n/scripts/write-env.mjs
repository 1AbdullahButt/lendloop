#!/usr/bin/env node
// Writes n8n/.env from the Convex deployment so the two shared secrets never have to be
// copied by hand. Prints variable NAMES only, never values.
//
//   node n8n/scripts/write-env.mjs [--webhook-url https://<tunnel>.trycloudflare.com] [--prod]
//
// --prod also fills CONVEX_SITE_URL_PROD (from `npx convex dashboard --prod`, or
// --prod-site-url <origin>) and N8N_TO_CONVEX_SECRET_PROD (production's secret), so the
// overdue-reminders workflow covers both deployments.
//
// Keys already in n8n/.env that this script does not manage (N8N_API_KEY,
// ALERT_WEBHOOK_URL, ...) are kept unchanged.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
const SHARED = ["CONVEX_TO_N8N_SECRET", "N8N_TO_CONVEX_SECRET"];

function run(cmd) {
  // stdio "pipe" keeps the output (which contains secrets) inside this process.
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function parseEnv(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

const args = process.argv.slice(2);
const webhookIdx = args.indexOf("--webhook-url");
const webhookUrl = webhookIdx >= 0 ? args[webhookIdx + 1] : undefined;
if (webhookIdx >= 0 && !/^https:\/\/[^\s/]+\/?$/.test(webhookUrl ?? "")) {
  console.error("--webhook-url must be an https origin, e.g. https://example.trycloudflare.com");
  process.exit(1);
}

const wantProd = args.includes("--prod");
const prodSiteIdx = args.indexOf("--prod-site-url");
const prodSiteArg = prodSiteIdx >= 0 ? args[prodSiteIdx + 1] : undefined;
if (prodSiteIdx >= 0 && !/^https:\/\/[a-z0-9-]+\.convex\.site\/?$/.test(prodSiteArg ?? "")) {
  console.error("--prod-site-url must be https://<deployment>.convex.site");
  process.exit(1);
}

const convexEnv = parseEnv(run("npx convex env list --include-values"));
const missing = SHARED.filter((k) => !convexEnv.get(k));
if (missing.length) {
  console.error(`Set these in Convex first (npx convex env set ...): ${missing.join(", ")}`);
  process.exit(1);
}

const dash = /dashboard\.convex\.dev\/d\/([a-z0-9-]+)/.exec(run("npx convex dashboard --no-open"));
if (!dash) {
  console.error("Could not find the Convex deployment name; is `npx convex dev` configured?");
  process.exit(1);
}

const current = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : new Map();
for (const k of SHARED) current.set(k, convexEnv.get(k));
current.set("CONVEX_SITE_URL", `https://${dash[1]}.convex.site`);
if (wantProd || prodSiteArg) {
  const prodEnv = parseEnv(run("npx convex env list --prod --include-values"));
  if (!prodEnv.get("N8N_TO_CONVEX_SECRET")) {
    console.error("Set N8N_TO_CONVEX_SECRET on production first (npx convex env set --prod ...)");
    process.exit(1);
  }
  let prodSite = prodSiteArg?.replace(/\/$/, "");
  if (!prodSite) {
    const prodDash = /dashboard\.convex\.dev\/d\/([a-z0-9-]+)/.exec(run("npx convex dashboard --prod --no-open"));
    if (!prodDash) {
      console.error("Could not find the production deployment; pass --prod-site-url https://<deployment>.convex.site");
      process.exit(1);
    }
    prodSite = `https://${prodDash[1]}.convex.site`;
  }
  current.set("CONVEX_SITE_URL_PROD", prodSite);
  current.set("N8N_TO_CONVEX_SECRET_PROD", prodEnv.get("N8N_TO_CONVEX_SECRET"));
}
if (webhookUrl) current.set("WEBHOOK_URL", webhookUrl.replace(/\/?$/, "/"));
if (!current.has("WEBHOOK_URL")) current.set("WEBHOOK_URL", "");
if (!current.has("ALERT_WEBHOOK_URL")) current.set("ALERT_WEBHOOK_URL", "");

const body = [...current].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
writeFileSync(envPath, body, { mode: 0o600 });
console.log(`Wrote n8n/.env with: ${[...current.keys()].join(", ")}`);
