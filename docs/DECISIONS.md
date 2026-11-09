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
- Loan length: at most **30 calendar days counting the first and last day** (`endDate − startDate ≤ 29`; Nov 15–Dec 14 is allowed, Nov 15–Dec 15 is not). This replaced an earlier "span" reading (`≤ 30`) that let a loan run 31 days while the form said "30 days max". Reason: R2 says "loan length ≤ 30 days", the home page says "up to 30 days", and the app already counts a loan inclusively everywhere (Nov 7–9 is "3 days"), so only the inclusive reading makes the number people see match the rule. The locked tests fix only `+29` accepted and `+31` rejected, so both readings pass them. Existing loans are not re-checked; only new requests.
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
- ~~System font stack instead of `next/font/google` — builds need no network.~~ Superseded by the redesign: fonts come from `next/font/google`, so `next build` needs network access once to download them (they are then self-hosted).
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

### Redesign (library checkout card)
- The design canvas (a local export, kept out of the repo) puts the tagline in the `<h1>`; the heading starts with a visually hidden "LendLoop: " — the locked AC1 test needs "LendLoop" in the main heading and the exact tagline visible.
- Names show as first name + last initial (`lib/names.ts`) in the UI only — the brief kept this change frontend-only; projecting short names in Convex is listed as a production change.
- Admin "Neighbors" table drops the role column and shows a masked email plus the last 6 characters of the user id (`b***@example.com · #3f9k2a`; not guaranteed unique, a clash between two given rows is about 1 in 100,000) under each name; an ADMIN tag marks admins — enough to tell two "Ben C." apart before changing a badge (QA L25), without full addresses on screen.
- Admin listing removal stays allowed while a tool is on loan (unlike the canvas) — `admin.removeListing` permits it by design and the loan stays returnable; the confirm text says so.
- The Trusted Lender control is a button whose text names the action ("Mark trusted" / "Remove badge" + hidden "for Ben C.") — the visible label stays inside the accessible name.
- Browse search filters the loaded list client-side; category still filters in `tools.list` — no new query was allowed.
- Browse shows "Out on loan" without a return date — `tools.list` has no loan dates; adding them was out of scope.
- Incoming keeps a request's APPROVED/DECLINED stamp in its tool group for the rest of the visit — the live query moves it at once, and the stamp is the confirmation.
- Client date checks mirror R2 (start ≥ today, end ≥ start, at most 30 days inclusive via `lastAllowedEnd`, shown as "30 days max") — the server re-checks and decides.
- Displayed status "Canceled" (US spelling); the stored status stays `cancelled` — the schema enums are fixed by the spec.
- The home page's sample borrowing card is labeled EXAMPLE and uses items the seed never lists — guests must not read it as real loan status (QA L21).
- Home page privacy copy says neighbors see "your name, never your email", not "first name and last initial" — the short form is applied in the UI only, so the stronger promise would not hold for the data (QA L24).
- The Browse bottom sheet is `inert` while closed, a dialog while open, takes focus on open and returns it to the tool tag on close; admin Resend and Remove keep focus on their table cell (QA L18).
- Admin email rows show the plain-language hint and, under it, the stored `lastError` (already redacted and capped) (QA L20).
- Seed runs prefer a signed-in row over a `seed_` placeholder with the same email, and delete an emptied placeholder (no tools, no loans) — otherwise later runs re-seed onto the ghost row and the admin sees two Olivias (QA L26).
- The open Browse sheet keeps focus inside itself with a focus guard at each edge, not by intercepting Tab — it is announced as a modal dialog, so focus must not reach the page behind the scrim (QA L27), and a Tab handler broke the month/day/year stops of the date inputs (QA L29).
- Under "Show failed only", a row resent on this visit stays listed — its new status and "Resent just now" stay visible and focus keeps a cell to land on (QA L28).
- The status each notification type announces lives in one dependency-free file, `convex/lib/announces.ts`, used by `admin.resendEvent` and the UI — the two rules can't drift.
- Motion: stamp press (320 ms, scale only) on stamps created by the user's own action and the hero card's first paint; mobile sheet slide; button press scale. No scroll-triggered reveals — this is a working tool, revisited often, and reveal-on-scroll hides content in full-page screenshots and for anyone scrolling fast.
- Fonts are self-hosted with `next/font/google` — no runtime request to Google, no layout shift from late swaps. Trade-off: `next build` downloads them, so an offline build fails; switch to `next/font/local` with committed font files if that matters.
- `admin.resendEvent` reuses the failed row and its idempotency key, refuses sent/queued (CONFLICT) and reminders (INVALID), and does not reset `attempts` — one notification per transition still holds, a double click schedules one job, and a resend that fails again goes straight back to `failed`.
- `admin.resendEvent` also refuses (CONFLICT) an email the loan has moved past: each type announces one status (`loan.requested` ↔ pending, `loan.approved` ↔ approved, …) — a "new request" email after the borrower cancelled would mislead the lender (QA L15). The admin table hides Resend for those and says why; the borrower's red note shows only for a still-current failed email, older failures stay as FAILED lines in Activity (QA L16).
- `loans.listMine` adds `emailStatus` (failed > queued > sent > null, over all of the loan's notifications) and a `type` on each notification activity item — the borrower sees a failed email even if a later one was sent, and which email it was, without keys or error text.
- Seed neighbors (`seed:neighbors`) are matched by email and linked to their real Clerk ids by `scripts/clerk-test-users.mjs` — signing in as one later reuses the seeded row instead of creating a duplicate. If that person already has a signed-in row, it wins and takes over the placeholder's loan-free tools; the placeholder never gets the same `clerkId` (two rows with one id break `unique()`, QA L22).
- The seed never re-links an existing signed-in row to a new Clerk id — a row's `clerkId` only changes from a `seed_` placeholder to a real id. If a test user is deleted and re-created in Clerk, their next sign-in gets a new, empty row; that is safer than moving someone's history onto a different Clerk account.
- Known dev-only seed edges, left as is: if `seed:overdueLoan {}` runs before the neighbors sign in, the placeholders keep that loan and stay as second rows; retiring a placeholder drops a Trusted badge that was set on it.
- `scripts/clerk-test-users.mjs` refuses any key but `sk_test_` — it creates users, so it must never touch a production Clerk instance.

### Deployment (Vercel + Convex production)
- The live app keeps the Clerk development instance: a Clerk production instance needs a domain we own, and `*.vercel.app` can't be used. Trade-off: the "Development mode" label, a console warning and Clerk's development limits.
- Convex production has the same five env vars as dev, copied value-for-value by a script that pipes each value to `npx convex env set --prod` on stdin, so no value appears in a command line, log or chat. Same HMAC secrets because one n8n serves both deployments; production would get its own.
- Convex functions are deployed with `npx convex deploy`, outside the Vercel build: no `CONVEX_DEPLOY_KEY` lives in Vercel. Cost: a `convex/` change must be deployed before the frontend that uses it.
- Vercel env vars are set for Production only: a preview deployment fails its build instead of quietly pointing a branch at production data.
- `.vercelignore` lists env files, `n8n/.env`, `qa/.auth` and local-only folders, because `vercel deploy` uploads the working folder, not the Git tree, and its default ignore list isn't a contract.
- The local n8n's `CONVEX_SITE_URL` stays on the dev deployment so `npm run test:kickoff` keeps working; overdue reminders for the live site need it switched to production.
- Auto-deploy uses a GitHub Action (`vercel deploy --prod` with a `VERCEL_TOKEN` repo secret), not Vercel's Git integration: the Vercel account's GitHub login is a different GitHub user that can't see this repo. The Action uploads the Git tree and Vercel builds it with its own env vars, so no app secret reaches the runner; the token has an expiry date and is the only secret in the repo settings.
- The seed gives Ben C. (the e2e lender) the design's three listings. A seed tool is skipped when its owner already has a tool with that name, compared case-insensitively and counting removed ones, so a re-run never duplicates a listing or brings back one an admin removed; the e2e run's own tools have other names and are never read or changed. `seed:overdueLoan` alone still ignores a removed stand mixer, because a loan needs a live tool.
- Demo accounts get a second, verified, primary address (`<name>_test@example.com`) and a password, via `scripts/clerk-demo-logins.mjs`; the `+clerk_test` address stays for the e2e run (Clerk's email filter matches any address on an account). The password is typed with hidden input and sent only to Clerk, never stored. Convex reads the email from the session token (`users.ensure` copies the primary address into the row), so the seed matches people on both addresses and the kickoff test checks every address on the account, not just the primary. Admin promotion is unaffected (`ADMIN_EMAILS` holds no demo address, and promotion never demotes); notifications go to whatever address is in the row.

### Dates and live status (found in the demo run)
- One clock per user: **the user's own time zone** (this replaced a first fix that put everything on UTC). `users.timeZone` holds an IANA name; the browser's zone is stored on first sign-in, and the header menu's "Time zone" item changes it. Every date, "today" label ("Today is Sun, Nov 8 · Asia/Karachi") and time ("1:31 AM GMT+5") a user sees is in that zone, so a page never mixes two days. Loan start and end dates are zone-less calendar days and render as-is.
- `users.setTimeZone` accepts only real IANA names: the IANA shape (`UTC`, `Etc/…` or `Area/Location`) and Intl must know the zone. Intl alone also accepts raw offsets like `+05:00`, which have no daylight-saving rules, so those are refused. It is a separate mutation so `users.ensure` keeps taking no arguments (a locked test passes it a role and expects a rejection).
- R2 uses the acting user's own "today": the requester's zone for "start date not in the past", and the lender's zone for "approve before the start date" (a New York lender at 9 PM can still approve a request starting that day; a Karachi lender at 1 AM the next day can't). A user with no zone stays on UTC. The locked acceptance tests' users never set one, so AC9 (start = yesterday UTC → INVALID) keeps its meaning without any change to the locked tests.
- The daily overdue check stays on UTC. (1) It is one batch job for everyone (n8n at 09:00); a per-user "today" would need it to run hourly and catch each borrower's own morning. (2) The reminder's idempotency key is `<loanId>:<UTC day>`, which guarantees one reminder per day; with per-user days, changing your zone could open a second "day" and send a second reminder within hours, or skip one. (3) The locked acceptance tests pin that UTC key. Cost: the OVERDUE badge counts days in the viewer's zone, so it can appear up to a day before or after the reminder goes out.
- Zone names come from the browser's Intl data as-is: "GMT+5" for Karachi and "EST" for New York (en-US has no "PKT"). "Today is…" shows the full IANA name, so the zone is never ambiguous.
- The Incoming day strip starts at today, or at an earlier stale request's start, never on a day nobody asked for (it used to start a day before). The full dates stay in the strip's aria-label.
- Incoming shows a date picture only when it helps. A tool whose waiting requests don't clash shows no calendar, just each request's date line ("Mon Nov 9 → Tue Nov 10 · 2 days"). When two or more waiting or approved requests on a tool overlap (at least one still waiting), a mini calendar appears, fitted to just those requests plus one day each side (`lib/clashCalendar.ts`): one cell per day with its number, the month where it starts or changes, a row per person, approved as a solid green bar, waiting as an amber outline, the overlapping days hatched brick red with a legend, and TODAY as a label above its cell only when it falls inside. Text is 13px or more. On a narrow screen it scrolls sideways inside its box. This replaced a two-week day strip, where 2–3 day bars were tiny, its pale today column looked like a waiting bar, and its labels were too small.
- The request cards list only tools with requests still waiting; approved loans appear only under "Out on loan". After an approve or decline, one note at the top says what happened and who was emailed ("Approved Maya R.'s request for Cordless drill (Nov 10–11). Maya has been emailed. Jake was told those dates are now taken."), and focus moves to it, because the decided request itself leaves the list.
- The kickoff e2e run cleans up after itself: an `afterAll` calls the internal `seed:cleanupRun` with the run's tools ("QA drill <stamp>", "QA spare ladder <stamp>") and the overdue loan it seeded. That closes their loans (approved ones returned, pending ones cancelled), removes the tools from the board and frees the lent tools, without queuing emails: it undoes test fixtures, it isn't news for anyone. Leftovers like "QA drill mw8cch67" came from runs before this existed.
- The Browse tag and borrowing card follow the viewer's own loan on a tool (`myLoanOn`: the one they hold, else their newest pending request): "With you", "Booked for you", "You asked", or "Dates taken".

### Dates taken (telling the other borrower)
- When a lender approves a request, every other borrower whose **pending** dates on that tool it newly covers gets one `loan.dates_taken` notification (email via n8n, and My requests says so). Their request is **not** declined: it stays pending (the locked AC10 test requires that too), and if the approved loan ends early it becomes approvable again on its own. Who gets told is one dependency-free rule, `convex/lib/clash.ts` `newlyBlocked`, shared by Convex (who to email) and the lender's Incoming page (whose names the note shows), so the two can't disagree.
- Not told: requests that don't overlap; requests already blocked by another approved loan (they were told when that loan was approved, so a second approval doesn't email them again); requests whose start has passed (unapprovable anyway); and the approving loan's own borrower (their own loan, not someone else's).
- Idempotency key `<loanId>:loan.dates_taken:<blockerLoanId>`: the usual `loanId:type`, plus the blocking loan. One blocker emails a borrower once; if those dates free up and a *different* approval takes them later, the borrower is told again. `typeFromKey` reads the second segment, so the five older keys are unchanged.
- Payload unchanged (the nine locked keys): the blocked request's own dates, and only that borrower's name and email. The lender's name, the other borrower and the blocking dates are never sent. My requests shows only that the dates are taken (and the blocking dates, without a name).
- Resending a failed "dates taken" email is allowed only while the request is pending **and** still blocked by that loan; otherwise it is out of date ("those dates are free again").
- No "your dates are free again" email: it isn't a change to the borrower's own request, it would fire on every early return, and My requests already updates live. Easy to add as another type if wanted.
- CONTRACT.md (locked) still lists five types and "one row per status change". That is documentation, not a test: approve now writes its own row plus one per newly blocked request, and the locked tests (which count rows per loan) all pass.
- The borrowing card reads `loans.listMine` live: after sending, its stamp and message follow the loan's status (approved, declined, returned), and the status line says "With you · due Nov 9" (or "Booked for you", "was due") when the viewer holds the approved loan. The sent loan is matched by tool and dates, newest first, because `useAction` reports only success. The stamp is pressed in only for the user's own send; a later answer swaps it quietly, per the stamp rule.

### Security round
- Other users' names leave Convex as first name + last initial (`tools.list`, `tools.listMine`, `loans.listMine`, `loans.listIncoming`, admin loans/tools). The locked AC2 assertion that `tools.list` returned the full owner name was changed by the tester, at the human's request, to the short form (qa/TEST-DISPUTES.md): the Browse screen never shows more, so the full name was data the browser didn't need.
- Every query has an explicit projection of what its screen reads (no raw docs); admins get a server-masked `emailHint`, never a full email, and event `type`/blocker parsed server-side instead of the idempotency key: a full address on an admin screen is still a leak if the screen never shows it.
- Incoming identifies borrowers by an opaque per-response key (`b1`, `b2`, …) instead of a user id: the clash helper only needs to tell borrowers apart.
- `displayName` is duplicated in `convex/lib/public.ts` (Convex can't import `lib/`); a unit test asserts it agrees with `lib/names.ts shortName`.
- n8n sits behind an nginx edge that passes only `/webhook/*` and `/healthz`: quick tunnels have no ingress rules, so the restriction has to live in a proxy. Port 5678 is bound to 127.0.0.1 so the editor is local-only.
- `/webhook-test/*` is not proxied: test webhooks run unsaved editor workflows and are never needed from outside.
- Replay inside the 5-minute window is stopped in n8n by remembering sent `eventId`s (workflow static data, 24 h, max 5000); an id is stored only after the send succeeded so a genuine retry still delivers, and a duplicate answers 200 so Convex doesn't retry it.
- CSP comes from Clerk's middleware `strict` mode (per-request nonce + `'strict-dynamic'`) rather than a static header: Clerk loads scripts from its frontend API host, and a nonce avoids `'unsafe-inline'` for scripts. `<ClerkProvider dynamic>` is needed so Clerk's script tag carries the nonce.
- `style-src` keeps `'unsafe-inline'`: React `style={{}}` props can't carry a nonce, and style injection is far lower risk than script.
- `CSP_REPORT_ONLY=1` is a deploy-time switch to report-only, so a CSP mistake can't ship a broken sign-in.
- Overdue reminders cover dev and production from one workflow: one item per deployment, each URL from n8n env (`CONVEX_SITE_URL`, `CONVEX_SITE_URL_PROD`), each signed with that deployment's secret (`N8N_TO_CONVEX_SECRET_PROD` falls back to the shared one). Each write-back goes to the deployment the loan came from, so each keeps its own `<loanId>:<day>` key.
- The GET continues on error, so one unreachable deployment doesn't cancel the other's reminders; a separate "Alert on failed fetch" node logs and throws afterwards, so the error workflow still fires (no silent failure).
- Admin "Older failures (n)": failed request emails the loan has moved past (same rule as `admin.resendEvent`, `lib/adminEvents.ts`) collapse into a closed `<details>` under the table, and "Needs attention" counts only resendable ones. Display only: rows are never deleted, so the audit trail stays complete.

### Demo cleanup
- Admin Listings shows active listings; removed ones sit in a collapsed "Removed listings (n)" section, and one removed on this visit stays in the table: removed rows can't be acted on, and the result should show where the admin clicked.
- `seed:cleanupRun` now deletes the e2e run's test tools, their loans and those loans' events instead of soft-removing them: soft-removed fixtures piled up in the admin tables and in Maya's history after every kickoff.
- `seed:cleanupRun` refuses any tool whose name doesn't start with "QA " or "Seed ": a hard delete must never reach a real listing by a wrong id.
- Old leftovers (removed QA/Seed tools from earlier runs) were purged once by hand with the same mutation on dev and production, after the owner approved the list.
