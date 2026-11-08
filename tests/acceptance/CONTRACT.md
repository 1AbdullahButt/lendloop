# LendLoop API contract (locked with the acceptance tests)

Source of truth: `SPEC.md` + `docs/DECISIONS.md`. This file is what the tests in this folder call and assert.
If something here looks wrong, file it in `qa/TEST-DISPUTES.md`; do not work around it.

## Conventions

- Errors: `throw new ConvexError({ code, message })`, `code` one of `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID`, `CONFLICT`; `message` is a string. Tests read `err.data.code` and require `typeof err.data.message === "string"`. Messages never contain another user's data (email, name).
- Every public function declares an `args` validator (`args: {}` when it takes none). Unknown args (e.g. `role`) must be rejected by validation. No public function has an arg named `role` or `isAdmin` at any depth (AC8 introspects `exportArgs()`).
- Authorization order: `requireUser(ctx)` / `requireAdmin(ctx)` (from `convex/lib/auth.ts`) is the **first** thing every non-public handler does, before loading or validating anything. The AC4/AC7 sweeps call every exported public function with validator-shaped dummy args and expect `UNAUTHENTICATED` (no identity) or `FORBIDDEN` (plain user on `admin.*`). New public functions are swept automatically.
- `requireUser`:
  - no identity -> `UNAUTHENTICATED`;
  - in a **query**: identity but no `users` row -> `UNAUTHENTICATED` (queries cannot insert);
  - in a **mutation**: identity but no row -> create it (`role: "user"`, `trustedLender: false`, `name`/`email` from the identity) per SPEC 3.
- `requireAdmin`: `requireUser`, then `role !== "admin"` -> `FORBIDDEN`. Role is read only from the `users` row; identity claims such as `role` or `publicMetadata.role` are ignored.
- "Today" is UTC (`YYYY-MM-DD`). The suite pins the clock to `2026-11-06T12:00:00Z` with fake timers.
- Tests run with fake timers; scheduled functions run only when a test calls `t.finishAllScheduledFunctions(vi.runAllTimers)`. `fetch` is always stubbed.
- Env vars read in Convex: `ADMIN_EMAILS` (comma-separated), `N8N_REQUEST_WEBHOOK_URL`, `CONVEX_TO_N8N_SECRET`, `N8N_TO_CONVEX_SECRET`. Read them at call time (tests stub them per test with `vi.stubEnv`).

## `convex/lib/hmac.ts` (pure, Web Crypto only)

| Export | Signature | Behaviour |
|---|---|---|
| `sign` | `(secret: string, timestamp: string, body: string) => Promise<string>` | Returns `"sha256=" + lowercase hex(HMAC-SHA256(secret, timestamp + "." + body))`. |
| `verify` | `(secret: string, timestamp: string, body: string, header: string, now: number) => Promise<boolean>` | `true` only if `timestamp` is a number of ms with `abs(now - ts) <= 5 min` and `header` equals the expected signature (constant-time compare). Anything malformed (empty header, missing `sha256=` prefix, wrong length, non-hex, empty/non-numeric timestamp) returns `false`; it never throws. |

Known vector: `sign("test-secret-vector", "1762430400000", '{"hello":"world"}')` = `sha256=2dd1e6734862aa90660e5f6d440bb2544a0d9767768ffd6157717fbad7b885c7`.

## Public functions (`api.*`)

### tools (`convex/tools.ts`)

| Function | Type | Args | Returns | Errors |
|---|---|---|---|---|
| `listPublic` | query, **no auth** | `{}` | `Array<{ _id, name, category }>` exactly those keys; only `status === "available"` and no `removedAt`. Works with or without identity (even an identity with no users row). | none |
| `list` | query | `{ category?: Category }` | Non-removed tools (available and on_loan). Each item has at least `_id, name, category, condition, description, status, ownerName: string, ownerTrusted: boolean`, where `ownerName` is the owner's first name + last initial (e.g. "Alice L."), never the full name. **No** `email`/`ownerEmail` field and no owner email anywhere in the payload. | UNAUTHENTICATED |
| `listMine` | query | `{}` | Caller's non-removed tools (each with `_id`). | UNAUTHENTICATED |
| `create` | mutation | `{ name, category, condition, description }` | `Id<"tools">`. Stores trimmed `name`/`description`, `ownerId` = caller, `status: "available"`, `createdAt`. | UNAUTHENTICATED; INVALID if trimmed name is not 1-80 chars or trimmed description > 500 chars. Category/condition outside the schema lists are rejected (arg validation is fine) and nothing is written. |
| `update` | mutation | `{ toolId, name?, category?, condition?, description? }` | `null`. Patches only given fields, same trimming/limits as `create`. | UNAUTHENTICATED; NOT_FOUND; FORBIDDEN if caller is not the owner (admins too); INVALID |
| `remove` | mutation | `{ toolId }` | `null`. Soft delete: sets `removedAt`; every `pending` loan on the tool becomes `cancelled` (one `loan.cancelled` event each). | UNAUTHENTICATED; NOT_FOUND; FORBIDDEN if not the owner (admins too); CONFLICT while the tool is `on_loan` |

`Category` = `"power_tools" | "hand_tools" | "garden" | "kitchen" | "camping" | "cleaning" | "other"`; `Condition` = `"new" | "good" | "fair" | "worn"` (export validators from `convex/schema.ts`).

### loans (`convex/loans.ts`)

| Function | Type | Args | Returns | Errors |
|---|---|---|---|---|
| `request` | mutation | `{ toolId, startDate, endDate }` (`YYYY-MM-DD`) | `Id<"loans">`; `status: "pending"`, `lenderId` = tool owner, `createdAt` | UNAUTHENTICATED; NOT_FOUND (missing **or removed** tool, R6); FORBIDDEN own tool (R1/AC6); INVALID dates (R2) |
| `cancel` | mutation | `{ loanId }` | `null`; `pending -> cancelled` | UNAUTHENTICATED; NOT_FOUND; FORBIDDEN unless caller is the borrower (lender included); INVALID if not pending |
| `approve` | mutation | `{ loanId }` | `null`; `pending -> approved`, sets `decidedAt`, tool `status = "on_loan"` (R4 decision) | UNAUTHENTICATED; NOT_FOUND; FORBIDDEN unless caller is the lender (borrower and admins included); INVALID if not pending; CONFLICT on overlap with an `approved` loan of the same tool |
| `decline` | mutation | `{ loanId }` | `null`; `pending -> declined`, sets `decidedAt` | as approve (no CONFLICT) |
| `markReturned` | mutation | `{ loanId }` | `null`; `approved -> returned`, sets `returnedAt`, tool `status = "available"` (also for a tool removed by an admin) | UNAUTHENTICATED; NOT_FOUND; FORBIDDEN unless lender; INVALID if not approved |
| `listMine` | query | `{}` | Loans where caller is borrower. Each item has at least `_id`, `status`, and `activity: Array<{ kind, status, createdAt, sentAt? }>` = this loan's `automationEvents`, newest first (`createdAt` desc), up to 10. Recommended extra fields: `toolName`, `startDate`, `endDate`. | UNAUTHENTICATED |
| `listIncoming` | query | `{}` | Loans where caller is lender (each with `_id`). | UNAUTHENTICATED |

Date rules (R2, AC9): `startDate >= today (UTC)`, `endDate >= startDate`, both must be real calendar dates in strict `YYYY-MM-DD` (reject `2026-11-6`, `2027-02-30`, `2026-13-01`, `""`, `07/11/2026`). Length: `endDate = startDate + 29 days` must be accepted, `+31 days` must be rejected; whether `+30` is allowed is the builder's call (record it in `docs/DECISIONS.md`). Same-day loans (`start = end = today`) are valid.

Overlap (R3, AC10): ranges are inclusive. A loan `[s1, e1]` conflicts with an approved `[s2, e2]` iff `s1 <= e2 && s2 <= e1`. Only `approved` loans block; `pending`, `declined`, `cancelled`, `returned` never do. Multiple non-overlapping approvals of one tool are allowed.

Transitions (R7, AC11): only `pending -> approved | declined | cancelled` and `approved -> returned`. Everything else -> INVALID, with no write and no new automation event.

### users (`convex/users.ts`)

| Function | Type | Args | Returns | Notes |
|---|---|---|---|---|
| `ensure` | mutation | `{}` | the caller's `users` document (`_id, clerkId, name, email, role, trustedLender`) | Creates the row on first call (`clerkId = identity.subject`, `name = identity.name`, `email = identity.email`). On every call: if the email is in `ADMIN_EMAILS` (comma-separated) set `role = "admin"`; **never** demotes. Idempotent: one row per `clerkId`. |
| `me` | query | `{}` | the caller's `users` document | UNAUTHENTICATED if no identity or no row |
| `setRole` | **internalMutation** | `{ userId: Id<"users">, role: "admin" \| "user" }` | `null` | Dashboard-only bootstrap/demote path. Must not be public. |

### admin (`convex/admin.ts`) — every function calls `requireAdmin`

| Function | Type | Args | Returns |
|---|---|---|---|
| `listAllLoans` | query | `{}` | all loans (each with `_id`) |
| `listTools` | query | `{}` | all tools **including removed** (each with `_id`, `removedAt?`) |
| `listUsers` | query | `{}` | all users |
| `listAutomationEvents` | query | `{}` (optional filters allowed) | automation events, newest first; each item has at least `_id, kind, status, attempts, lastError?` |
| `removeListing` | mutation | `{ toolId }` | `null`. Sets `removedAt` even while `on_loan`; pending loans -> `cancelled` (one event each); approved loan stays `approved` and returnable. |
| `setTrustedLender` | mutation | `{ userId, trusted: boolean }` | `null`. Changes `trustedLender` only, never `role`. |

A plain user calling any of these gets FORBIDDEN; a caller without identity gets UNAUTHENTICATED.

## Internal functions (`internal.*`)

| Function | Type | Tested? |
|---|---|---|
| `automation.deliver` | internalAction, args exactly `{ eventId: Id<"automationEvents"> }` | yes: scheduled name `automation:deliver`, args shape, retries |
| `users.setRole` | internalMutation | yes |
| `automation.getEventPayload` | internalQuery | no (recommended) |
| `automation.markSent` / `markFailed` / `recordReminderStatus` | internalMutation | no (recommended) |
| `automation.listOverdue` | internalQuery | no (recommended) |

`convex/automation.ts` must export no public function.

## Outbound: Convex -> n8n (SPEC 6.1, AC13/14/17)

- Every loan creation and status change (request, approve, decline, cancel by borrower, cancel by tool removal, markReturned) inserts **exactly one** `automationEvents` row: `{ loanId, kind: "request_notification", idempotencyKey: "<loanId>:<type>", status: "queued", attempts: 0, createdAt }` and calls `ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId })`. Mutations never call `fetch`.
- `type` is `loan.requested | loan.approved | loan.declined | loan.returned | loan.cancelled`.
- `deliver` POSTs to `process.env.N8N_REQUEST_WEBHOOK_URL` with `Content-Type: application/json` and body keys **exactly** `eventId, type, loanId, toolName, recipientName, recipientEmail, startDate, endDate, sentAt` (`sentAt` = ms number). Only one email address appears in the body.
- Recipient (party who did not act): `loan.requested` -> lender; `loan.approved` / `loan.declined` / `loan.returned` -> borrower; `loan.cancelled` by the borrower -> lender; `loan.cancelled` by owner `tools.remove` or `admin.removeListing` -> borrower.
- Headers: `X-LendLoop-Timestamp: <ms, 13 digits>` and `X-LendLoop-Signature: sign(CONVEX_TO_N8N_SECRET, timestamp, rawBody)`. Each attempt is freshly signed.
- Success (2xx): `status = "sent"`, `sentAt` set, `attempts` incremented, no `lastError`.
- Failure (fetch throws **or** non-2xx): `attempts` incremented, `lastError` stored (for HTTP errors it includes the status code; never the secret). Retry by scheduling `internal.automation.deliver` again with the same `{ eventId }` after 30 s, then 2 min, then 10 min. After the 4th failed attempt (1 initial + 3 retries): `status = "failed"`, `attempts = 4`, no further jobs. Visible via `admin.listAutomationEvents`.

## Inbound: n8n -> Convex HTTP actions (SPEC 6.2, AC15/16) in `convex/http.ts`

Both routes require `X-LendLoop-Timestamp` (ms) and `X-LendLoop-Signature` = `sign(N8N_TO_CONVEX_SECRET, timestamp, rawBody)`, with `|now - ts| <= 5 min`. GET signs the empty body (`"<ts>."`). Missing / wrong / stale / tampered -> **401 with an empty body**, nothing written. The outbound secret is not accepted inbound.

| Route | Success |
|---|---|
| `GET /n8n/overdue-loans` | 200 JSON array; each item has keys **exactly** `loanId, toolName, borrowerName, borrowerEmail, endDate, idempotencyKey` with `idempotencyKey = "<loanId>:<today UTC>"`. Includes loans with `status === "approved"` and `endDate < today`. Excludes loans that already have an `automationEvents` row with that key and `status: "sent"` (reminded today); a reminder from a previous day does not exclude. |
| `POST /n8n/reminder-status` | Body `{ idempotencyKey: string, loanId: Id<"loans">, status: "sent" \| "failed", error?: string }`. If no row has that key: insert `{ loanId, kind: "overdue_reminder", idempotencyKey, status, attempts: 1, createdAt, sentAt (when sent), lastError: error (when failed) }`. If a row exists: change nothing. Always 200 when signed and well-formed. Signed but malformed (not JSON, missing `idempotencyKey` or `loanId`, bad `status`) -> 400, nothing written. |

## Frontend (AC1, AC3)

- `/` (signed out, no redirect): `<h1>` containing `LendLoop`; the exact text `Borrow what you need. Lend what you don't.`; a button or link named exactly `Sign in to lend or borrow`.
- Tools region: `data-testid="public-tools"`. Inside it, either items `data-testid="public-tool-item"` (each containing `data-testid="public-tool-name"` and `data-testid="public-tool-category"`) or the empty state `data-testid="public-tools-empty"`. No element whose `data-testid` contains `owner`, no status/condition testids in the region, no email address in the page text, no `ownerId/ownerName/ownerEmail/ownerTrusted` in the DOM.
- Signed-out visits to `/tools`, `/my/listings`, `/my/requests`, `/my/incoming`, `/admin` end on the same origin at a path starting with `/sign-in` (app route `app/sign-in/[[...sign-in]]/page.tsx`).

## n8n exports (AC18) in `n8n/workflows/`

- Files: `request-notification.json`, `overdue-reminders.json`, `error-handler.json`, each a workflow with a non-empty `nodes` array.
- No `sk_live_/sk_test_/pk_live_/pk_test_/whsec_` tokens, PEM blocks, Slack/Discord webhook URLs, URLs with `token=/key=/secret=/signature=` params, hard-coded `*.convex.site|cloud` hosts, or emails outside `example.com`.
- Node `credentials` entries contain only `id` and `name`.
- request-notification: exactly one `n8n-nodes-base.webhook` node with `parameters.options.rawBody: true`; a `n8n-nodes-base.code` node whose code references `$env.CONVEX_TO_N8N_SECRET` and uses `timingSafeEqual`; a `n8n-nodes-base.respondToWebhook` node with `parameters.options.responseCode: 401`.
- overdue-reminders: a `n8n-nodes-base.scheduleTrigger`; a Code node referencing `$env.N8N_TO_CONVEX_SECRET`; the text references `$env.CONVEX_SITE_URL`, `/n8n/overdue-loans`, `/n8n/reminder-status`; every `n8n-nodes-base.httpRequest` node (at least 2) has `retryOnFail: true, maxTries: 3, waitBetweenTries: 10000`.
- error-handler: a `n8n-nodes-base.errorTrigger` node.

## Repository scan (AC18)

`git ls-files --cached --others --exclude-standard` (minus `package-lock.json` and binary assets) must contain no secret pattern above, no email outside `example.com` (only `KICKOFF.md`, the course brief, is exempt from the email check), and none of the values of the env var names in `.env.example` as found in `process.env`, `.env.local`, `.env` or `n8n/.env`. `.env.example` keeps names only.

## README (AC20)

`README.md` (not the create-next-app text) mentions LendLoop and has: a setup/getting-started heading whose section mentions Clerk, Convex, n8n and docker-compose; `ADMIN_EMAILS` and `setRole`; a markdown table containing every variable name in `.env.example` (including the commented n8n ones such as `CONVEX_SITE_URL`); a ```` ```mermaid ```` block; headings for security (section mentions HMAC and idempotency), data minimisation, and production changes.
