// Inbound n8n -> Convex routes. Signature first (401, empty body), then shape (400).
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { todayUtc } from "./lib/dates";
import { verify } from "./lib/hmac";

const http = httpRouter();

/** No detail on purpose: a caller probing the endpoint learns nothing. */
function unauthorized(): Response {
  return new Response(null, { status: 401 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Verifies against the exact raw bytes; re-serialised JSON could differ and weaken the check. */
async function isSigned(request: Request, rawBody: string): Promise<boolean> {
  const secret = process.env.N8N_TO_CONVEX_SECRET;
  const timestamp = request.headers.get("X-LendLoop-Timestamp");
  const signature = request.headers.get("X-LendLoop-Signature");
  if (!secret || !timestamp || !signature) return false;
  return await verify(secret, timestamp, rawBody, signature, Date.now());
}

type ReminderStatus = {
  idempotencyKey: string;
  loanId: string;
  status: "sent" | "failed";
  error?: string;
};

function parseReminderStatus(raw: string): ReminderStatus | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { idempotencyKey, loanId, status, error } = body as Record<string, unknown>;
  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) return null;
  if (typeof loanId !== "string" || loanId.length === 0) return null;
  if (status !== "sent" && status !== "failed") return null;
  if (error !== undefined && typeof error !== "string") return null;
  return { idempotencyKey, loanId, status, ...(typeof error === "string" ? { error } : {}) };
}

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    if (!(await isSigned(request, rawBody))) return unauthorized();
    const items = await ctx.runQuery(internal.automation.listOverdue, { today: todayUtc() });
    return json(items);
  }),
});

http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    if (!(await isSigned(request, rawBody))) return unauthorized();
    const parsed = parseReminderStatus(rawBody);
    if (!parsed) return json({ error: "Malformed body" }, 400);
    const result = await ctx.runMutation(internal.automation.recordReminderStatus, parsed);
    return result.ok ? json({ ok: true }) : json({ error: "Unknown loan or key" }, 400);
  }),
});

export default http;
