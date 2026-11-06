# LendLoop — Product & Technical Spec

> "Borrow what you need. Lend what you don't."

A neighbourhood tool-lending board. Neighbours list tools, request to borrow them for a date range, approve or decline requests, and mark loans returned. n8n handles notifications and overdue reminders.

This spec is the source of truth. Acceptance criteria (AC) are numbered; every AC must have a test or a documented manual check in `qa/QA-REPORT.md`.

---

## 1. Stack (fixed by the brief)

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind |
| Auth | Clerk (`@clerk/nextjs`) + `ConvexProviderWithClerk` |
| Data + backend | Convex (queries, mutations, actions, HTTP actions, scheduler, crons not needed) |
| Automation | n8n, self-hosted via `docker-compose.yml` |
| Tests | Vitest + `convex-test` (backend, RBAC, idempotency, HMAC), Playwright (public page + auth gate) |

No other backend. No Next.js API routes holding business logic. All authorization lives in Convex functions.

---

## 2. Data model (Convex schema)

```
users
  clerkId: string            // identity.subject  (index: by_clerkId)
  name: string
  email: string              // never sent to the public page; sent to n8n only when needed
  role: "admin" | "user"     // default "user"
  trustedLender: boolean     // default false, only admins can change

tools
  ownerId: Id<"users">       // index: by_owner
  name: string               // 1–80 chars
  category: "power_tools" | "hand_tools" | "garden" | "kitchen" | "camping" | "cleaning" | "other"
  condition: "new" | "good" | "fair" | "worn"
  description: string        // 0–500 chars
  status: "available" | "on_loan"
  removedAt?: number         // soft delete by admin; removed tools are hidden everywhere except admin views
  createdAt: number

loans                         // a borrow request and, once approved, the loan
  toolId: Id<"tools">        // index: by_tool
  borrowerId: Id<"users">    // index: by_borrower
  lenderId: Id<"users">      // denormalised tool owner at request time; index: by_lender
  startDate: string          // ISO date YYYY-MM-DD
  endDate: string            // ISO date YYYY-MM-DD, >= startDate, max 30 days
  status: "pending" | "approved" | "declined" | "returned" | "cancelled"
  createdAt: number
  decidedAt?: number
  returnedAt?: number
  // index: by_status_endDate  (for overdue lookup)

automationEvents              // outbound webhook log + idempotency for inbound write-backs
  loanId: Id<"loans">        // index: by_loan
  kind: "request_notification" | "overdue_reminder"
  idempotencyKey: string     // index: by_key, UNIQUE by convention (checked in mutation)
  status: "queued" | "sent" | "failed"
  attempts: number
  lastError?: string
  createdAt: number
  sentAt?: number
```

"Overdue" = `status == "approved"` AND `endDate < today (UTC)` AND not returned.

---

## 3. Roles & permissions (enforced in Convex, not just the UI)

Every public Convex function that is not on the public page starts with `requireUser(ctx)`, which:
1. calls `ctx.auth.getUserIdentity()`; throws `UNAUTHENTICATED` if null;
2. loads the `users` row by `clerkId`; creates it on first call (`role: "user"`).

Role comes **only** from the Convex `users` table. Never from Clerk public metadata sent by the client, never from a request argument.

Admins are bootstrapped by the env var `ADMIN_EMAILS` (comma-separated) read in the Convex `users.ensure` mutation, or by an internal mutation run from the Convex dashboard. Document both in the README.

| Action | Guest | User | Admin |
|---|---|---|---|
| List available tools (name + category only) | ✅ | ✅ | ✅ |
| See full tool details, status, filters | ❌ | ✅ | ✅ |
| Create a tool | ❌ | ✅ (owner = self) | ✅ |
| Edit / delete a tool | ❌ | own only | own only (admins *remove*, see below) |
| Remove any listing (soft delete) | ❌ | ❌ | ✅ |
| Request to borrow | ❌ | ✅, not own tool | ✅, not own tool |
| Cancel a request | ❌ | own pending request | own pending request |
| Approve / decline | ❌ | requests on own tools | requests on own tools |
| Mark returned | ❌ | loans on own tools (lender) | loans on own tools |
| View all loans | ❌ | ❌ | ✅ |
| Set "Trusted Lender" | ❌ | ❌ | ✅ |

Errors: throw `ConvexError` with a code (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID`, `CONFLICT`). Never leak another user's data in an error message.

---

## 4. Business rules

- R1. A user cannot request their own tool.
- R2. `endDate >= startDate`, `startDate >= today`, loan length ≤ 30 days.
- R3. A tool can have many `pending` requests, but approving one is only allowed if the dates do not overlap an existing `approved` loan for that tool. Otherwise throw `CONFLICT`.
- R4. Approving sets the tool `status = "on_loan"` only when the approved loan's startDate ≤ today; otherwise it stays available until the start date (keep simple: set `on_loan` on approve and document the choice — the agent picks one and records it in `docs/DECISIONS.md`).
- R5. Marking returned sets `loan.status = "returned"`, `returnedAt`, and tool `status = "available"`.
- R6. Removed tools (`removedAt` set) cannot be requested; their pending requests become `cancelled`.
- R7. Status transitions allowed only: `pending → approved | declined | cancelled`, `approved → returned`. Anything else throws `INVALID`.

---

## 5. Pages

| Route | Who | Content |
|---|---|---|
| `/` | everyone | LendLoop name, tagline, **read-only list of available tools: name + category only, no owner info**, "Sign in to lend or borrow" button (Clerk) |
| `/tools` | signed in | All tools with availability status, category filter, "Request" button (date range) |
| `/my/listings` | signed in | My tools: create, edit, delete; see requests per tool |
| `/my/requests` | signed in | Requests I made + status + automation activity ("Reminder sent 2 days ago") |
| `/my/incoming` | signed in | Requests on my tools: approve / decline / mark returned |
| `/admin` | admin | All loans, remove listing, toggle Trusted Lender |

Middleware: Clerk protects `/tools`, `/my/*`, `/admin`. **The middleware is a convenience, not security** — Convex enforces again.

UI: minimal and clean. Empty states for every list. Loading and error states. Trusted Lender shows a small badge next to the lender's display name (signed-in views only).

The public query (`tools.listPublic`) must return a projection `{ _id, name, category }` and nothing else. A test asserts the returned object keys.

---

## 6. Integration: Convex ↔ n8n

### 6.1 Outbound: request notification (Convex → n8n)
- Trigger: a loan is created or changes status.
- The mutation **does not** call n8n directly. It writes an `automationEvents` row (`queued`) and schedules an internal action with `ctx.scheduler.runAfter(0, ...)`.
- The action POSTs to `N8N_REQUEST_WEBHOOK_URL` with a **minimal payload**:
  ```json
  { "eventId": "<automationEvents id>", "type": "loan.requested|loan.approved|loan.declined|loan.returned|loan.cancelled",
    "loanId": "...", "toolName": "...", "recipientName": "...", "recipientEmail": "...",
    "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "sentAt": 1730000000000 }
  ```
  Only the recipient's contact, never both parties' emails. Recipient = lender for `loan.requested`, borrower otherwise.
- Headers: `X-LendLoop-Timestamp: <ms>` and `X-LendLoop-Signature: sha256=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>`.
- HMAC uses Web Crypto (`crypto.subtle`) so it runs in the default Convex runtime.
- Retries: up to 3 attempts with backoff (scheduler `runAfter` 30s, 2m, 10m). After the last failure: `status = "failed"`, `lastError` stored, visible in admin view.

### 6.2 Inbound: n8n → Convex HTTP actions
Convex `http.ts` routes, all requiring a valid signature (same scheme, secret `N8N_TO_CONVEX_SECRET`) and timestamp within 5 minutes (replay protection):
- `GET /n8n/overdue-loans` → `[{ loanId, toolName, borrowerName, borrowerEmail, endDate, idempotencyKey }]` where `idempotencyKey = "<loanId>:<today YYYY-MM-DD>"`.
- `POST /n8n/reminder-status` body `{ idempotencyKey, loanId, status: "sent"|"failed", error? }` → upserts an `automationEvents` row by `idempotencyKey`. **Calling it twice with the same key changes nothing the second time and returns 200.**
- Unsigned, badly signed or stale requests → 401 with no detail.

### 6.3 n8n workflows (exported JSON in `n8n/workflows/`)
1. **request-notification.json** — Webhook node (raw body) → Code node verifies HMAC with `$env.CONVEX_TO_N8N_SECRET` (constant-time compare) → Switch on `type` → "Send" (email via SMTP credential, or a mock: write to n8n execution log + a `mock-outbox.log` file) → Respond 200. Bad signature → Respond 401.
2. **overdue-reminders.json** — Schedule trigger daily 09:00 → signed GET `/n8n/overdue-loans` → Split items → Send reminder (mock or email) → signed POST `/n8n/reminder-status` per item. Retry on fail (node settings: 3 tries, 10s wait).
3. **error-handler.json** — Error Trigger workflow set as the error workflow of 1 and 2; logs workflow name, node, error, execution id (mock outbox or Slack/Discord webhook if configured).

Secrets live only in env vars / n8n credentials. Exported JSON must contain **no secrets, no URLs with tokens, no emails**. A test (`tests/acceptance/no-secrets.test.ts`) scans `n8n/workflows/*.json` and the repo for known secret patterns.

---

## 7. Acceptance criteria

Public & auth
- AC1. `/` shows the name, tagline, available tools with name and category only, and a sign-in button.
- AC2. `tools.listPublic` returns only `_id`, `name`, `category`, and excludes `on_loan` and removed tools.
- AC3. Visiting `/tools`, `/my/*`, `/admin` signed out redirects to sign-in.

RBAC (Convex tests with `convex-test` `withIdentity`)
- AC4. Unauthenticated calls to every non-public function throw `UNAUTHENTICATED`.
- AC5. A user cannot edit, delete or approve on another user's tool (`FORBIDDEN`).
- AC6. A user cannot request their own tool.
- AC7. A non-admin cannot call admin functions (remove listing, list all loans, set trusted).
- AC8. Role cannot be changed by any client-callable function.

Loans
- AC9. Date validation (R2) is enforced server-side.
- AC10. Overlapping approval throws `CONFLICT`.
- AC11. Only the allowed status transitions succeed (R7).
- AC12. Mark returned makes the tool available again.

Integration
- AC13. Creating or changing a loan queues exactly one `automationEvents` row and schedules the action.
- AC14. Outbound payload contains only the fields in 6.1 and a valid signature (unit test the signer).
- AC15. HTTP actions reject missing, wrong and stale signatures with 401.
- AC16. `POST /n8n/reminder-status` is idempotent: same key twice → one row, unchanged.
- AC17. Failed outbound sends retry up to 3 times, then show as `failed` in the admin view.
- AC18. Exported n8n JSON contains no secrets (scan test).
- AC19. `/my/requests` shows recent automation activity per loan.

Docs
- AC20. README: setup (Clerk, Convex, n8n via docker-compose), env vars table, architecture diagram (Mermaid), security & data-minimisation decisions, production changes note.

---

## 8. Out of scope
Payments, deposits, chat between users, maps, images, real email deliverability tuning, mobile app.
