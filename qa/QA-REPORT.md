# LendLoop QA report

QA agent, independent review, 2026-11-06 (re-run). I did not write this code.

This round reviews the uncommitted changes made since the previous report (commit `053c9f6`):
- The fixes for L3, L4 and L8: `convex/loans.ts`, `components/EnsureUser.tsx`, `components/loans/LenderActions.tsx`, `components/loans/IncomingRequests.tsx`, `components/listings/ListingCard.tsx`, `README.md`, `docs/DECISIONS.md` and the new `tests/unit/approve-stale.test.ts`.
- A follow-up fix in `components/EnsureUser.tsx` for L12, a finding raised earlier in this round: the `latestRun` guard.

I re-ran every automated check and reviewed the diff line by line for regressions. To check the account-switch path, I also read the installed `convex@1.49.0` sources `react-clerk/ConvexProviderWithClerk.js`, `react/ConvexAuthState.js` and `browser/sync/authentication_manager.js`. Earlier code-review evidence for files that did not change is carried over from the previous round. That round covered `CLAUDE.md`, `SPEC.md`, `KICKOFF.md`, `docs/`, `tests/acceptance/CONTRACT.md`, all code in `convex/`, `app/`, `components/`, `lib/` and `middleware.ts`, plus the n8n workflows and `docker-compose.yml`.

## Summary

**Addendum, 2026-11-07: live end-to-end run.** KICKOFF §4 now runs against the real stack: a Clerk dev instance, the Convex dev deployment, n8n 2.47.1 in Docker and a cloudflared tunnel. The run uses `qa/e2e/kickoff.spec.ts` and passed (1 test, 3.7 min); see section 2a. Two issues surfaced and are fixed (L13, L14). Afterwards `npm run check` passed with **130/130** tests, the acceptance Playwright suite passed **10/10**, and `no-secrets` passed 11/11.

- `npm run check` passes after the L12 fix: typecheck, lint, **127/127** Vitest tests in 11 files (126 before, plus the new L3 regression test) and the production build. Playwright passes **10/10**.
- All 20 acceptance criteria still pass. Five parts still can't be automated here because no test signs in to Clerk and Docker isn't available: AC17 (admin UI), AC19 (UI), the signed-in parts of AC5, AC6 and AC12, and the n8n runtime. For these the code-review evidence from the previous round stands, and the human manual checks are listed below.
- **L3, L4, L8 and L12 are resolved.**
  - **L3:** `approve` refuses stale requests server-side, after the auth and ownership checks, and the UI explains why.
  - **L4:** `EnsureUser` unmounts its children in the same render that the Clerk user changes.
  - **L8:** the README seed step matches `convex/seed.ts`.
  - **L12:** only the most recent `ensure` run may store its result, so a call that comes back late for a superseded run can no longer overwrite the gate.
- **No regressions.**
  - `approve` still runs `requireUser` → `loadLoanAs` (`NOT_FOUND`/`FORBIDDEN`) → `requireStatus` before the new date check. A non-lender can't learn anything from the new error.
  - No query returns a new field. `startDate` was already in both lender views.
  - `EnsureUser` still guarantees a brand-new user never sees `UNAUTHENTICATED`, including under strict mode, on retry and when switching accounts.
- The security review is unchanged. The only server-side change is three lines in `approve`. There are still 21 public functions, 20 of them gated. `fetch(` appears only in the internal `deliver` action. No role arguments appear on public functions.
- Findings: no high, no medium. Of the 12 low findings, 8 remain open (L1, L2, L5–L7, L9–L11) and 4 are resolved (L3, L4, L8, L12).

## 1. Checks run

`npm run check`, re-run after the L12 fix (exit 0):

```
> tsc --noEmit && next lint && vitest run && next build
✔ No ESLint warnings or errors
 Test Files  11 passed (11)
      Tests  127 passed (127)
 ✓ Compiled successfully in 3.4s
 ✓ Generating static pages (10/10)
EXIT=0
```

`npx playwright test`, re-run after the L12 fix (exit 0; it starts `npm run dev` with the human's `.env.local`):

```
Running 10 tests using 2 workers
  ok  AC1 x5 (public-page.spec.ts), ok  AC3 x5 (auth-gate.spec.ts: /tools, /my/listings, /my/requests, /my/incoming, /admin)
  10 passed (26.5s)
EXIT=0
```

New regression test, run on its own:

```
 ✓ tests/unit/approve-stale.test.ts > approve rejects a pending request whose start date has passed 44ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

The only warnings are framework deprecation notices: `next lint`, and Clerk `createRouteMatcher` (L10).

Extra checks (this round):
- **Approve order (L3).** By reading the code, a stranger, the borrower or an admin still gets `FORBIDDEN` from `loadLoanAs` before the start-date check. A wrong status still gets `INVALID` from `requireStatus` first.
  - The new test checks that a stale `approve` gives `INVALID` and writes nothing: the loan stays `pending` and the tool stays `available`. It also checks that `decline` still clears the stale request.
  - The acceptance AC5/AC10/AC11 tests all still pass, so B2 and B3 behave as before.
- **Account switch (L4).** I traced the switch through the installed Convex and Clerk code:
  - Clerk's `sessionId` is in the deps of `fetchAccessToken`, so a switch rebuilds it. `ConvexAuthState` then runs `clearAuth()` and sets `isConvexAuthenticated` to `null`, so `isLoading` is true.
  - `setAuth` → `setConfig` calls `pauseSocket()` synchronously, before its first `await`. Its effect is a sibling *before* the `ConvexProvider` subtree, so it mounts before `EnsureUser`'s effect.
  - So any `ensure` issued during the switch is held until the new token is authenticated, and runs as the new user.
  - In the first render with the new Clerk `userId`, `status.userId !== userId`, so `EnsureUser` renders "Setting up your account…" and its children unmount. No frame runs the new account's queries before its row exists.
- **Superseded runs (L12 fix).** Each `runEnsure` takes `run = ++latestRun.current` synchronously and immediately sets `{userId: forUser, phase: "ensuring"}`. After `await`, it stores `ready`/`error` only if `run === latestRun.current`. I checked these properties:
  - **A superseded run never writes.** Results from a previous user's call, or from the first of the two calls made during a switch, are dropped.
  - **The latest run always writes.** Nothing can supersede it except a newer run, which then owns the status. A run's `ensuring` state is set before its `await`, so it can't be overwritten by an older run either.
  - **The latest run is always for the current user.** A run starts only from the effect (when `userId` equals the current Clerk user) or from Retry (`current.userId === userId`). Any later `userId` change re-fires the effect: at once if Convex is still authenticated, otherwise via `startedFor` being reset and the effect running again when `isAuthenticated` returns. So after a switch, the latest run is for the new user, and its own result moves the gate to `ready` or to `error` with Retry. The gate can't be left stuck on a superseded result.
  - **A → B → A quickly:** each change starts a new latest run for the user now signed in.
  - **Strict mode:** refs survive React's simulated unmount and remount, and the `startedFor` guard still makes the second effect return. So there is one call, `run 1 === latest`, and it stores. Render doesn't touch either ref.
  - **Retry:** each click starts a new latest run. The first click switches to the loading state, which removes the button. Even a double click resolves to the newest outcome.
  - **Stale closures:** none. `runEnsure` depends only on `ensure`, which is stable, and reads only refs and its own arguments. ESLint `react-hooks/exhaustive-deps` is clean.
  - The only way to stay on "Setting up your account…" is the latest call never settling. Convex re-sends pending mutations on reconnect, and this behaviour is the same as before the fix.
- **README (L8).** Checked against `convex/seed.ts`:
  - `borrowerId` alone works, and the lender is the `@example.com` seed user.
  - Borrower equal to lender gives `INVALID`.
  - The no-argument run uses the seed borrower.
  - Reminders are `automationEvents` rows of type `overdue_reminder`, which `admin.listEvents` and `AdminEvents.tsx` ("Overdue reminder") show.
- **Files changed.** Apart from this report, `git status` shows only the builder's changes listed above. I wrote only this file.

## 2. Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 | PASS | Playwright `public-page.spec.ts`, 5/5: "/ is reachable signed out", "shows the LendLoop name … and the tagline", "shows a 'Sign in to lend or borrow' button or link", "shows the tools region with either tool items or the empty state", "renders no owner information and no email addresses". `components/PublicTools.tsx` is unchanged and renders only `name` and the category label. |
| AC2 | PASS | `tools-public.test.ts`: "each item has keys exactly _id, name, category", "excludes on_loan tools, owner-removed tools and admin-removed tools", "an identity without a users row can still call listPublic". `convex/tools.ts` is unchanged. |
| AC3 | PASS | Playwright `auth-gate.spec.ts`: 5/5 routes redirect to `/sign-in`. `middleware.ts` is unchanged, and Convex enforces again (AC4). |
| AC4 | PASS | `rbac.test.ts`: "every public function except tools.listPublic throws UNAUTHENTICATED without identity" (sweep), "queries with a valid identity but no users row throw UNAUTHENTICATED". `requireUser` is still the first statement in `approve`. |
| AC5 | PASS | `rbac.test.ts` AC5 block (8 tests) is green. The new stale check sits after `loadLoanAs`, so `FORBIDDEN` still comes first (B2). UI buttons are cosmetic. The `LenderActions` change only adds `disabled={busy \|\| stale}` and a hint. Code review evidence; human manual check listed. |
| AC6 | PASS | `loans.test.ts` "requesting your own tool throws FORBIDDEN and writes nothing". `loans.request` is unchanged. |
| AC7 | PASS | `rbac.test.ts`: "a plain user calling every public admin.* function gets FORBIDDEN" (sweep), plus admin via `ADMIN_EMAILS` and via internal `setRole`. |
| AC8 | PASS | `rbac.test.ts` AC8 block: no public `role`/`isAdmin` arg (introspected), `setRole` is internal, identity claims are ignored, promote-only. A grep this round found no `role:`/`isAdmin:` validator on any public function. |
| AC9 | PASS | `loans.test.ts` AC9 block is green. R2 is now also enforced at approval: `approve-stale.test.ts`. |
| AC10 | PASS | `loans.test.ts` AC10 block (inclusive overlap, contained range, non-overlapping both approve) is green. The overlap check is unchanged and still runs before any write. |
| AC11 | PASS | `loans.test.ts` AC11 block (6 tests: every forbidden transition gives `INVALID`, with no write and no event). |
| AC12 | PASS | `loans.test.ts` "markReturned sets loan returned + returnedAt and tool available (back on the public list)". `markReturned` is unchanged. D1 is ruled on below. |
| AC13 | PASS | `automation.test.ts` AC13 block (each lifecycle mutation queues exactly one event plus `automation:deliver`; "mutations never call fetch themselves"). The new `approve` branch throws before any write or queue. |
| AC14 | PASS | `automation.test.ts` "delivery POSTs exactly the SPEC 6.1 fields with a valid HMAC signature", recipient tests; `hmac.test.ts` known vector. |
| AC15 | PASS | `http.test.ts` AC15 block (missing, partial, wrong secret, stale or future 6 min, replay after 6 min, malformed → 401 with empty body). `convex/http.ts` is unchanged. |
| AC16 | PASS | `http.test.ts` "same idempotencyKey twice -> 200 both times, one row, unchanged the second time", plus malformed → 400. L1 is noted below. |
| AC17 | PASS | `automation.test.ts` "network failure -> 1 attempt + 3 retries at 30s, 2m, 10m, then failed with lastError", non-2xx counts as a failure, and a successful retry stops. The admin UI is `components/admin/AdminEvents.tsx` (unchanged). Code review evidence; human manual check listed. |
| AC18 | PASS | `no-secrets.test.ts`, 11 tests, green. The new test uses only `@example.com` identities. The README and DECISIONS changes contain no ids, keys or hosts. |
| AC19 | PASS | `automation.test.ts` "each loan has an activity array with notifications and reminders, newest first". `MyRequests.tsx` → `ActivityList` → `lib/activity.ts` are unchanged. Code review evidence; human manual check listed. |
| AC20 | PASS | `readme.test.ts`, 6 tests, green. The README still has setup, an env table, a Mermaid diagram, Security, Data minimisation and "What I'd change for production". Seed step 6 has been rewritten correctly (L8). |

**Human manual checks still listed** (they need two Clerk accounts plus Docker n8n, as in KICKOFF §4):
1. User B requests A's tool. A approves on `/my/incoming`. B's `/my/requests` shows "Notification sent …".
2. With your own email in `ADMIN_EMAILS`, `/admin` loads. Remove a listing and toggle Trusted Lender; the badge then shows on `/tools`.
3. Set a bad `N8N_REQUEST_WEBHOOK_URL`. After about 12.5 minutes the event shows `failed` and `attempts 4` in Admin → Automation events.
4. Sign in, copy your `users` `_id`, and run `npx convex run seed:overdueLoan '{"borrowerId":"<your users id>"}'`. Run overdue-reminders: "Reminder sent" appears on your `/my/requests`, and a second run sends nothing.
5. Import the workflows and set the error workflow by hand (D3). `signed-request.mjs notify --bad-signature` and `--stale` both get 401.
6. (L4/L12, optional) Sign in as A, open `/my/requests`, then switch to a brand-new account B without reloading (Clerk multi-session or sign out → sign up). You should see "Setting up your account…", then B's empty pages, and never an `UNAUTHENTICATED` error or a gate stuck on loading.
7. (L3, optional) To see a stale pending request, leave a request that starts today pending past 00:00 UTC. On `/my/incoming` its Approve button is disabled with the text "The start date has passed, so this request can only be declined.", and Decline still works.

## 2a. Live KICKOFF §4 run (2026-11-07)

`npm run test:kickoff` (`qa/e2e/kickoff.spec.ts`) signs in lender, borrower and admin in separate browser contexts with `@clerk/testing` sign-in tokens, so no password or code is typed. It then drives the real app. Result: **1 passed (3.7m)**. Manual checks 1, 2, 4 and 5 above are now covered live. Check 3 (bad webhook URL → `failed` after 4 attempts) was not run live; AC17's automated retry test covers it.

| Step | Evidence | Result |
|---|---|---|
| A lists two tools | `qa/screenshots/01-lender-my-listings.png` | PASS |
| B requests the drill | `02-borrower-requested.png` | PASS |
| A approves on `/my/incoming` | `03-lender-approved.png` | PASS |
| B's `/my/requests` shows "Notification sent" twice (requested → lender, approved → borrower), each delivered Convex → tunnel → n8n | `04-borrower-notification-sent.png`; Admin → Automation events shows both `sent`, 1 attempt | PASS |
| Admin removes a listing and marks A Trusted Lender | `05-admin-removed-and-trusted.png` (the admin's own row and avatar are masked) | PASS |
| B sees the Trusted Lender badge; the removed listing is gone from `/tools` and from the public page | `06-borrower-trusted-badge.png`, `07-public-page.png` | PASS |
| Seeded overdue loan: the overdue workflow runs twice through the n8n CLI. Convex then holds exactly one `overdue_reminder` row (`sent`, 1 attempt), unchanged by the second run. The mock outbox has exactly one reminder line, and B's `/my/requests` shows "Reminder sent" | `08-borrower-reminder-sent.png`; Convex `automationEvents`; n8n `mock-outbox.log` | PASS |

n8n setup was verified in the same session. All three workflows imported through the n8n CLI, the hand-written JSON was accepted unchanged, both main workflows have `errorWorkflow` = the error handler, and all three are active. Through the tunnel, `signed-request.mjs notify` got 200 and `--bad-signature`, `--stale` and `--unsigned` each got 401. A signed `GET /n8n/overdue-loans` from the n8n side got 200.

## 3. Security review (CLAUDE.md non-negotiables)

| # | Rule | Result | Evidence |
|---|---|---|---|
| 1 | Authorization in Convex | OK | Still 21 public functions; 20 call `requireUser`/`requireAdmin` first, and `tools.listPublic` is the only open one. In `approve`, the new check comes after `requireUser`, `loadLoanAs` (lender only) and `requireStatus`. The UI disabling Approve is cosmetic; the server enforces the rule (`approve-stale.test.ts`). |
| 2 | Role from the `users` table only | OK | `convex/users.ts` and `convex/lib/auth.ts` are unchanged, and no public function has a role argument. `EnsureUser` uses Clerk `userId` and a run counter only to manage client-side render state, never for any decision about role or access. |
| 3 | Public data projected | OK | `listPublic` is unchanged and returns `{ _id, name, category }`. |
| 4 | No secrets in the repo | OK | The diff adds no env values, ids or hosts. The new test uses `lena@example.com` and `bo@example.com`. The README uses the placeholder `<your users id>`. |
| 5 | Signed both ways | OK | `convex/lib/hmac.ts`, `convex/http.ts` and the n8n workflows are unchanged since the previous round. That round verified the Web Crypto compare (full-length XOR) and n8n's `timingSafeEqual`, both with a 5-minute window. |
| 6 | Idempotent write-backs | OK | Unchanged. One row per `idempotencyKey`; L1 is noted. |
| 7 | Mutations never call the network | OK | The only `fetch(` in `convex/` is `automation.ts:101`, inside the internal action `deliver`. The new `approve` branch only throws. |
| 8 | Locked tests | OK | `.tests-locked` is present and nothing under `tests/acceptance/` changed. The new test is in `tests/unit/`, which isn't locked, and it only adds coverage. |

Grep results for the qa.md list, this round: no gated handler is missing `requireUser`; no role comes from args; no `fetch(` in mutations; no secrets or non-example emails in the changed files or fixtures; no non-constant-time compare (unchanged); no HTTP action without the timestamp window (unchanged).

## 4. Data minimisation

| Surface | Exposes | Verdict |
|---|---|---|
| `/` + `tools.listPublic` | `_id, name, category` of available, non-removed tools | Within SPEC 5 and unchanged. PASS |
| Convex → n8n body | exactly the SPEC 6.1 fields; one email, the recipient's | Unchanged. PASS |
| `GET /n8n/overdue-loans` | exactly `loanId, toolName, borrowerName, borrowerEmail, endDate, idempotencyKey` | Within 6.2 and unchanged. PASS |
| `POST /n8n/reminder-status` | `{ok:true}`, 400 with a generic message, 401 with an empty body | Unchanged. PASS |
| Signed-in queries | No query changed. `LenderActions` gets `startDate`, which `listIncoming` and the listings view already returned and rendered. The new error message carries no names, emails or dates and is only reachable by the lender. | PASS |
| n8n internals | Unchanged since the previous round (emails masked, executions pruned after 7 days; the webhook execution data still holds one email, documented). | PASS |

## 5. Try to break it

The 12 `convex-test` probes from the previous round targeted code that is unchanged in this diff, except that B2, B3 and B9 go through `approve`. For those three, the acceptance tests and the new regression test re-confirm the behaviour.

| Probe | Result |
|---|---|
| B1 Request own tool | `FORBIDDEN`, 0 loans, 0 events (acceptance `loans.test.ts`; `request` unchanged) |
| B2 Approve or decline someone else's request (stranger, borrower, admin) | `FORBIDDEN` comes before the new date check. The `rbac.test.ts` AC5 block is green. |
| B3 Double-approve overlapping dates | Second approve gives `CONFLICT`, and re-approving gives `INVALID`. The AC10/AC11 blocks are green. |
| B4 Replay a signed POST and GET after 6 minutes | 401 with an empty body, nothing written (`http.test.ts` AC15; `http.ts` unchanged) |
| B5 Post the same reminder twice | 200 and 200, one row, unchanged (`http.test.ts` AC16) |
| B6 `failed` then `sent`, same key | One row, upgraded to `sent` (L1) |
| B7 Write-back edge cases | Unchanged (L2) |
| B8 Return one of two approved loans | Tool stays `on_loan` until the second is returned (D1) |
| B9 Approve a pending request after its start date passed | **Now refused with `INVALID`.** Loan stays `pending`, tool stays `available`, and Decline still works (`approve-stale.test.ts`). L3 is resolved. |
| B10 Duplicate `deliver` for a sent event | No second `fetch` (unchanged) |
| B11 `ADMIN_EMAILS` + `emailVerified: false` | Stays `user` (unchanged; `rbac.test.ts`) |
| B12 Admin removes an on_loan tool, then the lender returns it | Unchanged |
| B13 (new) Switch Clerk account without a reload | Traced through the code (see section 1). Children unmount in the switch render, and `ensure` is held by the paused socket until the new token is authenticated. Late results from superseded runs are discarded by `latestRun`, and the latest run for the current user always sets the final status. L4 and L12 are resolved. |

## 6. Grading criteria (brief)

- **Code structure:** good, and unchanged in shape.
  - The new server rule is three lines with a comment explaining why.
  - `LenderActions` reuses `lib/dates.todayUtc`, which is the same UTC clock as `convex/lib/dates`.
  - `EnsureUser` keeps one `Status` keyed by user plus two refs, each with a comment explaining why.
- **UX:** good. Approve is disabled for stale requests, with an explanation in text (not a tooltip), so screen readers get it. Decline stays available. The account switch shows "Setting up your account…" instead of a possible error flash, and can't get stuck there on a superseded result. Minor: `stale` is computed at render time, not on a timer, so a page left open across 00:00 UTC keeps Approve enabled. Clicking it then shows the server's `INVALID` message in `InlineError`, so the user still gets a clear answer.
- **Integration reliability:** good and unchanged: outbound retries at 30 s, 2 min and 10 min, then `failed` with `lastError`; n8n retries; an error workflow; idempotent write-backs.
- **Docs:** good.
  - README step 6 now matches the seed's behaviour exactly.
  - `docs/DECISIONS.md` has one line each for the L3 rule and the user-keyed `EnsureUser`.
  - Nit: the `latestRun` guard is explained in a code comment but has no DECISIONS line yet. CLAUDE.md asks for one per non-obvious choice. This is optional and not a finding.

## 7. Rulings on known deviations (unchanged)

| # | Deviation | Ruling |
|---|---|---|
| D1 | `markReturned` keeps the tool `on_loan` while another approved loan remains (SPEC R5 says `available`) | **Accept, low.** It follows from the recorded R4 choice ("on_loan from approval"). The single-loan flow and AC12 behave exactly as R5 says. Suggest deriving status from active loans in production. |
| D2 | `NODE_FUNCTION_ALLOW_BUILTIN=crypto,fs` | **Accept, low.** `fs` is needed for the mock outbox only. It is documented, and the docs say to drop it with real email. |
| D3 | Error workflow set by hand after import | **Accept, low.** Imported workflows get new ids. The step is documented, and it stays on the manual check list. |
| D4 | `ADMIN_EMAILS` trusts the identity email unless `emailVerified === false` | **Accept, low.** Clerk verifies addresses by default, and an explicit unverified claim blocks promotion (B11). |
| D5 | n8n does not dedupe by `eventId` | **Accept, low.** SPEC requires idempotency for write-backs only. Listed in the README production note. |
| D6 | docker `TZ=Asia/Karachi` | **Accept, low.** It only decides when "09:00" fires. "Today" in Convex is UTC. Suggest `${GENERIC_TIMEZONE:-UTC}`. |

## 8. Findings

No high or medium findings.

| ID | Severity | Status | Finding | Fix (optional) |
|---|---|---|---|---|
| L1 | low | open | The write-back upgrades a `failed` row to `sent` on a later call with the same key. CONTRACT and SPEC 6.2 say a repeat "changes nothing". Identical repeats are unchanged, so AC16 holds. Documented in DECISIONS. | Ask the tester to record this in CONTRACT.md, or keep it as is. |
| L2 | low | open | `recordReminderStatus` accepts any valid date in the key and any existing loan, including pending loans and dates other than today (B7). Only a signed n8n can reach it. | Optionally require `day === todayUtc()` (±1) and `loan.status === "approved"`. |
| L3 | low | **resolved** | `approve` didn't re-check R2, so a stale pending request could become an overdue loan. | Fixed: `approve` throws `INVALID` when `startDate < todayUtc()`, after the auth, ownership and status checks. The UI disables Approve and explains why. `tests/unit/approve-stale.test.ts`. |
| L4 | low | **resolved** | `EnsureUser` didn't reset on an account switch, so children could render for one frame before `ensure` ran. | Fixed: status is keyed by Clerk `userId`, and a mismatch renders the loading state in the same render. `startedFor` is keyed by user, so strict mode still calls once. See section 1 for the trace. |
| L5 | low | open | D1 (multi-booking return keeps `on_loan`) | See section 7. |
| L6 | low | open | D2, D3, D4, D5, D6 | See section 7. |
| L7 | low | open | Lists `collect()` whole tables (admin, `tools.list`, `listPublic`) | Documented as a production change. |
| L8 | low | **resolved** | The README seed step promised "Reminder sent" on `/my/requests` even with the default `@example.com` borrower. | Fixed: step 6 tells you to pass your own `borrowerId`, and says the no-argument seed shows the reminder only in Admin → Automation events. Checked against `convex/seed.ts` and `admin.listEvents`. |
| L9 | low | open | `/tools` does not show a tool's already-approved date ranges, so a borrower can request dates that hit `CONFLICT` only at approval. R3 is enforced correctly on the server. | Show booked ranges on the tool card. |
| L10 | low | open | Framework deprecations: `next lint` and Clerk `createRouteMatcher` | Track for the Next 16 and Clerk upgrades. |
| L11 | low | open | `KICKOFF.md` (course brief, with the submission email) is committed. It is exempt from the scan and not a secret. | Consider removing it before publishing the repo. |
| L13 | medium | **resolved** | Found in the live run: Clerk's current Convex integration sends the plain session token (`aud = convex`), which has no `email` or `name` claim. Users were stored as "Neighbour" with an empty email. Nobody could be promoted through `ADMIN_EMAILS`, and notifications would have had no recipient. Unit tests could not see this, because they build identities with an email. | Fixed: README Clerk step 3 adds `email`, `name` and `email_verified` as custom session-token claims, and the human set them on the instance. `displayName()` derives a name from the email when Clerk has none (`tests/unit/display-name.test.ts`). The email still comes only from the verified token, never from the client. |
| L14 | low | **resolved** | Test bug in the first KICKOFF spec: the public-page check that the removed listing is gone ran while the list still showed "Loading tools…", so it passed without proving anything. | Fixed: the spec waits for tool items or the empty state before asserting. Re-verified live: the public list shows only available, non-removed tools, and the removed one is absent. |
| L12 | low | **resolved** | Raised earlier this round: `EnsureUser.runEnsure` wrote its result after `await` without checking it was still the latest run. During an account switch, a superseded call (the previous user's, or the first of two new-user calls) could settle last and overwrite the newer status. That left an error screen, or "Setting up your account…" until reload. | Fixed: a `latestRun` ref counter. Each call takes `run = ++latestRun.current` before its `await` and stores `ready`/`error` only if `run === latestRun.current`. A superseded run never writes, the latest run always writes, and the latest run is always for the current user. Strict mode, Retry and switches A→B→A all end on the latest run's own outcome. `npm run check` 127/127 and Playwright 10/10 after the change. See section 1. |

## 9. Fixes required

None are blocking. Every AC passes, and no high or medium finding is open. L13, the only medium, was found and fixed in the live run. L3, L4, L8, L12, L13 and L14 are resolved without regressions, and the `latestRun` DECISIONS line is in. The most worthwhile optional fixes remaining are L1, L2 and L9. KICKOFF §4 is verified live (section 2a). Only the optional manual checks 3, 6 and 7 remain.

RESULT: PASS
