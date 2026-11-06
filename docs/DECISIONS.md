# Decisions

One line each: decision — reason. Agents add to this as they build; the README security section is drawn from it.

- Authorization is enforced in Convex functions, the Next.js middleware only redirects — UI checks can be bypassed by calling Convex directly.
- Role is stored in the Convex `users` table and bootstrapped from `ADMIN_EMAILS` — clients must never be able to assert their own role.
- Mutations queue `automationEvents` and schedule an action instead of calling n8n — mutations must stay deterministic and fast, and queued events give us retries and an audit trail.
- Webhooks are signed with HMAC-SHA256 over `timestamp.body` with a 5-minute window — proves the sender and blocks replays.
- Reminder write-backs are keyed `loanId:date` — n8n retries can't create duplicate reminders.
- The public list returns only id, name and category — guests don't need owner identity or condition to browse.
- n8n payloads carry only the recipient's name and email — the notifier doesn't need the other party's details.

## Build decisions (approved before /build)
- R4: a tool becomes `on_loan` as soon as a loan is approved, whatever its start date — simplest rule, R3 already blocks double booking.
- Owners "delete" a tool as a soft delete (`removedAt`), and its pending requests become `cancelled` (R6) — keeps loan history and automation events consistent.
- Owners cannot delete a tool while it is `on_loan` (`CONFLICT`); admin `removeListing` always works and the active loan stays returnable — an owner shouldn't strand a borrower, but moderation must never be blocked.
- Queries cannot insert, so the client calls `users.ensure` once after sign-in; a query with a valid identity but no `users` row throws `UNAUTHENTICATED`.
- The frontend waits for `users.ensure` to finish before mounting any signed-in query — a brand-new user never sees an `UNAUTHENTICATED` flash.
- `ADMIN_EMAILS` is applied on every `users.ensure`: it promotes, never demotes — you can become admin after signing up, and removing an email from the list can't silently lock out a running admin (demote via the dashboard `users.setRole`).
- Notification recipient is the party who did not act: requested → lender; approved/declined/returned → borrower; cancelled by the borrower → lender; cancelled by admin removal → borrower — notifying someone about their own click is noise.
- Outbound delivery is one initial attempt plus 3 retries at 30s, 2m and 10m, then `failed` with `lastError` — matches "retry up to 3 times" with the three listed delays.
- Outbound idempotency key is `<loanId>:<type>` — R7 makes each transition happen at most once per loan, so a double-fired mutation can't queue two notifications.
- Overdue reminder key is `<loanId>:<YYYY-MM-DD>` — at most one reminder per loan per day, however often n8n retries.
- Signed GET requests sign the empty body (`<timestamp>.`) — one scheme for every route.
- `GET /n8n/overdue-loans` skips loans already reminded today — re-running the workflow by hand sends nothing twice.
- "Today" is UTC everywhere in Convex (R2 and overdue) — one clock; the n8n container's timezone only decides when 09:00 fires.
- The AC1 browser test accepts either tool items or the empty state — the e2e run has no seed data; the projection itself is covered by AC2.
- Signed-out visits to protected routes redirect to the app's own `/sign-in` page — a stable URL the AC3 test can assert.
- Admins edit and delete only their own tools and use `removeListing` for anyone else's — moderation is a separate, logged-as-admin action, not an override of ownership.
- Tool fields are validated in Convex mutations: strings trimmed, name 1–80 chars, description ≤500, category and condition from the schema lists, else `INVALID` — the UI form is a convenience, not the check.
- Next.js is pinned to 15 — the kit's `next lint` script and `middleware.ts` name are Next 15 conventions, and Next 16 removes/renames both.
- React is 19.1.10, not the 19.1.0 the scaffold pinned — `@clerk/nextjs` requires the patched 19.1.4+ line.
- `@types/node` is 22 — matches the Node 22 runtime and Vitest 5's peer range.
- The request-notification Webhook node uses Raw Body and the HMAC is checked on that exact string — re-serialised JSON can differ byte-for-byte and would break or weaken verification.
- Git is committed locally at each phase; pushing and the GitHub remote are left to the human.

## Test contract decisions (tester, locked with tests/acceptance/)
- Requesting your own tool (R1/AC6) throws `FORBIDDEN` — it is a permission rule about who may act, not malformed input.
- Requesting a removed tool (R6) throws `NOT_FOUND` — removed tools are hidden everywhere except admin views, so they should look absent.
- Loan date ranges are inclusive for overlap (R3): a loan starting on another approved loan's `endDate` conflicts — the end date is the last day the borrower holds the tool.
- Loan length: `start + 29 days` must pass and `start + 31 days` must fail; `+30` is left to the backend builder to choose and record here — the spec's "30 days" is ambiguous between span and calendar-day count.
- Dates must be strict, real `YYYY-MM-DD` calendar dates (`2026-11-6` and `2027-02-30` are `INVALID`) — lexicographic comparison of ISO dates is only safe on canonical strings.
- Every public Convex function declares an `args` validator — unknown args such as `role` are then rejected by Convex, which the AC8 test relies on.
- `requireUser`/`requireAdmin` run before any lookup or validation — the AC4/AC7 sweeps call every public function with dummy args and expect `UNAUTHENTICATED`/`FORBIDDEN` first.
- `users.setRole` takes `{ userId, role }` — the dashboard shows user ids next to emails, and ids can't be mistyped into another user.
- A cancellation caused by the owner's `tools.remove` notifies the borrower — same "party who did not act" rule as admin removal.
- `loans.listMine` items carry `activity`: that loan's automation events (`kind, status, createdAt, sentAt?`), newest first, up to 10 — enough for "Reminder sent 2 days ago" without exposing idempotency keys or n8n errors.
- `POST /n8n/reminder-status` with a valid signature but malformed body (not JSON, missing `idempotencyKey`/`loanId`, bad `status`) returns 400 and writes nothing — signature first (401), then shape.
- A failed outbound HTTP response (non-2xx) counts as a failed attempt, and `lastError` includes the status code — a 500 from n8n is a delivery failure just like a network error.
- The AC18 email scan exempts only `KICKOFF.md` (the course brief's submission address, never processed by the app); `package-lock.json` and binary assets are skipped for all patterns. `KICKOFF.md` was then removed before publishing, so in the public repo nothing is exempt.

## Builder decisions

### Backend
- Loan length is limited by `endDate − startDate ≤ 30`, so `start + 30` is allowed — "max 30 days" is read as a span; tests require `+29` to pass and `+31` to fail.
- A cancellation caused by removing a tool sets `decidedAt`; a borrower's own cancel does not — delivery uses this to pick the `loan.cancelled` recipient with no schema change, and the recipient is decided once and stored.
- The event type is read back from the key `<loanId>:<type>` at delivery — no extra column.
- `markReturned` sets the tool `available` only if no other approved loan remains — under R4 a later approved booking still holds the tool.
- Owner `tools.remove` on an already removed tool → `NOT_FOUND`; `admin.removeListing` on one is a no-op — removed tools look absent to owners, and moderation is safe to repeat.
- Delivery skips events that are no longer `queued` — a stray duplicate job can never send twice.
- Each outbound attempt signs with a fresh timestamp — a retry 10 minutes later is still inside n8n's 5-minute window.
- `lastError` is short text ("HTTP 500 from webhook", "Network error: …") with the secret and webhook URL replaced by `[redacted]`, max 300 chars — the admin view never shows credentials.
- A missing webhook URL or secret counts as a failed attempt with normal retries — misconfiguration shows up as `failed` in admin.
- Inbound requests get 401 when `N8N_TO_CONVEX_SECRET` is unset, and `verify` returns false for an empty secret — a missing secret never means accept-all.
- `POST /n8n/reminder-status` returns 400 unless `loanId` exists and `idempotencyKey` is exactly `<loanId>:<YYYY-MM-DD>` — stops write-backs for unknown loans or keys that clash with notification keys.
- `reminder-status` uses an internal mutation returning `{ ok }` instead of throwing — the route maps to 200/400 without relying on error propagation through `runMutation`.
- `users.ensure` copies a changed name/email from Clerk, and `ADMIN_EMAILS` is matched against the Clerk identity email — display names stay current.
- `tools.list` returns `isMine` instead of `ownerId` — the UI hides Request on own tools without seeing owner ids.
- Loan lists resolve names and Trusted badges per request and never include emails; only `admin.listUsers` returns emails, and the admin Users table is the only UI showing them — admins need them to identify accounts.
- Lists collect whole tables, newest first — fine at neighbourhood scale; pagination and a `by_status` index are production changes.
- `seed:overdueLoan` is internal, uses `@example.com` seed users only and reuses them by `clerkId` — safe to run repeatedly.
- A reminder row that is `failed` can be upgraded once to `sent` by a later write-back with the same key; `sent` is final and every other repeat changes nothing — otherwise a failed send keeps the loan on the overdue list and every re-run sends again, while one row per key keeps write-backs idempotent.
- Email, name and `email_verified` reach Convex as custom claims on Clerk's session token (Configure → Sessions), not from client arguments — Clerk's current Convex integration sends the session token, which has no email by default, and an email from the client could be forged to match `ADMIN_EMAILS`.
- Users without a Clerk name get a display name from their email's local part, without any +tag — Clerk test sign-ups have no name, and two "Neighbour"s can't be told apart.
- `loans.approve` re-checks R2 and refuses (`INVALID`) a pending request whose start date has passed; the lender UI disables Approve and says to decline — otherwise a stale request becomes a loan that is already running or overdue the moment it is approved.
- `users.ensure` skips `ADMIN_EMAILS` promotion when the identity says `emailVerified === false` (Clerk's Convex JWT template includes `email_verified`) — an address nobody proved must not grant admin; only an explicit `false` blocks, so tokens without the claim still work.

### Frontend
- `ClerkProvider` sits in the server `app/layout.tsx`; only `ConvexProviderWithClerk` is a client component — Clerk's App Router pattern.
- Clerk v7 removed `SignedIn`/`SignedOut`; the home page uses the server `<Show when="signed-in">` — the old components throw in v7.
- Signed-out visitors on `/` get a plain link to `/sign-in` named "Sign in to lend or borrow" — present in the server HTML before Clerk JS loads, and always same-origin.
- Middleware redirects explicitly to `/sign-in?redirect_url=<path>`, and `signInUrl`/`signUpUrl` are set in code — never depends on an env var or Clerk's hosted portal.
- `EnsureUser` calls `users.ensure` once per Clerk user via a ref, ties its ready/error state to that user id, and shows loading then error-with-retry — strict-mode double effects don't double-call, and after an account switch the page unmounts at once instead of running the new account's queries before its row exists.
- `EnsureUser` numbers each `ensure` run and stores only the latest run's result — during an account switch an older call can resolve last, and must not overwrite the newer status.
- Each live list sits in a `QueryBoundary` error boundary showing the `ConvexError` `data.message` with Try again — `useQuery` throws server errors during render.
- Date inputs use UTC today for `min`, and end `max` = start + 30 — Convex judges R2 in UTC.
- Request stays enabled for `on_loan` tools — R3 only blocks overlapping approvals, so future requests are valid.
- `/admin` checks `users.me.role` first and shows "Admins only" without firing admin queries; `FORBIDDEN` maps to the same state — no error flash; Convex still enforces.
- Admin roles are read-only in the UI; Trusted Lender is the only toggle — roles change only via `ADMIN_EMAILS` or `users.setRole` (AC8).
- System font stack instead of `next/font/google` — builds need no network.
- Activity lines use `sentAt` for sent events, else `createdAt` — "sent 2 days ago" means delivery time.

### n8n
- n8n is pinned to 2.47.1 with `N8N_RUNNERS_MODE=internal` — 2.x always runs Code in task runners; internal mode shares the filesystem so the mock outbox works; external runners are a production change.
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto,fs` only — HMAC needs `crypto`, the mock outbox needs `fs`; drop `fs` with real email.
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` — workflows read secrets from `$env`, so exported JSON never holds a secret.
- The Verify node rejects requests with no raw body rather than falling back to `$json.body` — re-serialised JSON can differ byte-for-byte.
- The signature format (`sha256=` + 64 lowercase hex) is checked before `timingSafeEqual` — equal-length buffers, so the compare never throws.
- A missing `CONVEX_TO_N8N_SECRET` throws instead of answering 401 — misconfiguration should trigger the error workflow.
- Unknown `type` → 400 via the Switch fallback — Convex records a failure instead of n8n silently dropping it.
- Overdue POSTs run one at a time, each signed just before sending — a long list can't age a timestamp past 5 minutes; retries reuse it, at most about 50 s.
- A failed mock send posts status `failed` with an error ≤200 chars; Convex call failures throw — bad sends are recorded, infrastructure failures go to the error workflow.
- Outbox lines and node outputs mask the recipient email (`a***@example.com`).
- The error handler redacts email-shaped text and caps messages at 500 chars.
- Execution data is pruned after 7 days — webhook executions still contain the recipient email.
- `settings.errorWorkflow` is unset in the exports — imports get new ids, so it is set by hand.
- The optional Slack/Discord alert sends both `text` and `content` — one node covers both.
