# LendLoop QA report

## 2026-11-07: Redesign (branch `redesign/library-card`, uncommitted working tree)

QA agent, independent review. I did not write this code.

**Scope.** I made four passes on the same day.
- **First pass (report written at 18:23):**
  - I reviewed the frontend restyle to the "library checkout card" design (`/`, `/tools`, `/my/listings`, `/my/incoming`, `/my/requests`, `/admin`).
  - I reviewed the backend additions: `admin.resendEvent`, plus `emailStatus` and activity `type` in `loans.listMine`.
  - The rest of the review covered `convex/seed.ts` (`seed:neighbors`), `scripts/clerk-test-users.mjs`, `qa/e2e/kickoff.spec.ts`, README, DECISIONS and the unit tests.
  - I ran 17 throwaway probes and reviewed the 8 live screenshots. This pass raised L15–L25.
- **Second pass (19:27):** I checked the fixes for L15–L25. I read the 18 files newer than the first-pass report in full, re-ran every check and ran 10 throwaway `convex-test` probes (`<scratchpad>/qa/probes3/`). L15–L24 were resolved; L25 stayed open, and the pass raised L26–L28.
- **Third pass (19:47):** I checked the fixes for L25–L28 and for three code nits.
  - I read the 12 files newer than the second-pass report in full and re-ran every check.
  - I ran 9 `convex-test` probes and a Chromium focus probe (`<scratchpad>/qa/probes4/`).
  - I read the dev deployment's `users` table, read-only, printing only id suffixes and counts.
  - L25–L28 were resolved, and the pass raised L29.
- **Fourth pass (20:02, this update):** I checked the L29 fix and the doc and comment nits.
  - 4 files are newer than the third-pass report (plus `tsconfig.tsbuildinfo`): `components/tools/BorrowingCard.tsx`, `components/admin/AdminUsers.tsx` (comment only), `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`. I read each one in full and re-ran every check.
  - I probed the **real** `BorrowingCard` component this time, not a copy. esbuild bundles it into a scratchpad page (`<scratchpad>/qa/probes5/`), with stubs only for `convex/react` and `next/link`. A Chromium probe walks focus with real key presses, and the page also gets an axe-core scan. Nothing was added to the repo.

### R.0 Summary

- **`npm run check` passes:** typecheck, lint, **146/146** Vitest tests in 15 files (125 acceptance + 21 unit) and the production build.
- **Playwright passes 10/10** on the first try. The orchestrator's runs this pass and last pass were also 10/10.
- **The protected areas are unchanged.**
  - `git diff HEAD` is empty for `SPEC.md`, `.tests-locked`, `tests/acceptance/`, `n8n/` and `middleware.ts`.
  - It is also empty for `convex/lib/auth.ts`, `hmac.ts`, `events.ts` and `removal.ts`, and for `convex/http.ts`, `automation.ts`, `schema.ts`, `users.ts` and `tools.ts`.
  - No Convex file changed this pass. `convex/_generated/api.d.ts` only gained the `lib/announces` module entry (third pass), so there are still 22 public functions.
- **Fix status:**
  - **L29 is resolved.** Every Redesign-round finding, L15–L29, is now resolved.
  - **Code nits:**
    - **Resolved:** the shared type→status map, the "canceled" wording, the ToolForm placeholder, `ARCHITECTURE.md:49` and `:262`, and the "unique" wording for the id suffix.
    - **Documented, not changed:** S10 is a DECISIONS line, and S6 and S9 are recorded in DECISIONS as known dev-only edges.
    - **Open, as agreed:** the Activity cap.
- **New this pass:** 0 high, 0 medium, 0 low. There are two minor accessibility nits (R.6a):
  - `aside` with `role="dialog"` trips axe `aria-allowed-role`, as it has since L18;
  - a backward wrap into "Until" lands on its month field.
- **All 20 ACs still PASS.** No AC status changed.
- **The live kickoff passed on the final code.** The human re-ran `npm run test:kickoff` after all L15–L29 fixes (2026-11-07, 20:16–20:18); `test-results/.last-run.json` reads `passed` with no failed tests.
  - All 8 screenshots in `qa/screenshots/` are fresh from that run. `05` shows the masked email and id suffix under each neighbor (L25) with the admin's own row still masked, and `07` shows the EXAMPLE card (L21).
  - The kickoff selectors `Mark trusted for <name>` and `Remove badge for <name>` matched the new hidden labels, as expected.
  - L27, L28 and L29 remain verified by probe and code review only: the kickoff runs at desktop width, where the borrowing card is a side panel with no focus guards.
- **No secrets.** `no-secrets.test.ts` passes 11/11 (tracked and untracked files). A grep of the files changed in the third pass found no address outside `example.com`, no key or token pattern, and no deployment or tunnel host. This pass only changed one component, one comment and two docs.
- **Still open from earlier rounds:** L1, L2, L5, L6, L7, L9 and L10.

### R.1 Checks run (fourth pass)

Ports 3000 and 3001 were free and no `node` process was running. The build ran first, and Playwright ran after it.

`npm run check` (exit 0):

```
> tsc --noEmit && next lint && vitest run && next build
✔ No ESLint warnings or errors
 Test Files  15 passed (15)
      Tests  146 passed (146)
 ✓ Compiled successfully in 3.1s
 ✓ Generating static pages (10/10)
EXIT=0
```

Tests per file (verbose run, third pass; no test file changed since):
- acceptance: automation 16, hmac 11, http 15, loans 25, no-secrets 11, rbac 24, readme 6, tools-public 9, tools-validation 8;
- unit: admin-resend 9, approve-stale 1, display-name 3, harness 1, my-requests-email-status 4, seed-neighbors 3. Test 3 of seed-neighbors also re-runs `seed:neighbors {}` and `seed:overdueLoan {}`.

`npx playwright test --output <scratchpad>/pw-out9` (exit 0). `--output` points at the scratchpad because Playwright empties its output directory at start. That keeps `test-results/.last-run.json` (the human's kickoff PASS, 18:08:23) untouched. I checked that it was unchanged after the run.

```
Running 10 tests using 2 workers
  ok AC1 x5 (public-page.spec.ts), ok AC3 x5 (auth-gate.spec.ts: /tools, /my/listings, /my/requests, /my/incoming, /admin)
  10 passed (26.9s)
EXIT=0
```

The only warnings are framework deprecations: `next lint` and Clerk `createRouteMatcher` (L10). Ports 3000 and 3001 were free again after the run.

Earlier passes, for reference:
- **First pass:** `npm run check` passed 141/141 in 14 files and Playwright passed 10/10. `scripts/clerk-test-users.mjs` reads only `sk_test_` keys, never prints the key and logs no email.
- **Second and third passes:** 146/146 in 15 files each time, and Playwright 10/10 (26.4 s in the third pass).
- **Flake (orchestrator only):** in the second pass, the orchestrator's first Playwright run right after a push had one timeout. "AC1: renders no owner information and no email addresses" was still showing "Loading tools…" after its 15 s wait, and the rerun was green.
  - The first `tools.listPublic` query after a push is probably slow.
  - It has not recurred since.
  - The spec is locked, so wait a few seconds after a push (or load `/` once) before `npm run test:e2e`.

### R.2 Acceptance criteria: evidence moved by the redesign (status unchanged)

The table in section 2 below keeps its statuses, and all 20 ACs still PASS. These rows replace evidence that pointed at deleted files (`ActivityList.tsx`, `LenderActions.tsx`, `lib/activity.ts`, `lib/relativeTime.ts`) or that changed during the Redesign round:

| AC | Result | Evidence this round |
|---|---|---|
| AC1 | PASS | Playwright `public-page.spec.ts` 5/5. `PublicTools.tsx` still renders only `name` and the category label from `listPublic`. The `<h1>` is a visually hidden "LendLoop: " followed by the visible tagline, and the visible wordmark is in the header (recorded in DECISIONS). The sample card is tagged EXAMPLE and uses items the seed never lists (L21). Live: `07-public-page.png`, taken before the L21 fix, shows the wordmark, the tagline, "Sign in to lend or borrow" and name+category tags only. |
| AC4 | PASS | The `rbac.test.ts` sweep is introspected and covers 22 public functions, including `admin:resendEvent`. All 21 gated ones throw `UNAUTHENTICATED`; only `tools:listPublic` is open. The new `convex/lib/announces.ts` adds a module but no function. |
| AC5 | PASS | The server is unchanged (rbac AC5 block green). Re-run probe P2: a stranger, the borrower and an admin all get `FORBIDDEN` on approve and decline. The UI in `IncomingRequests.tsx` disables Approve with a reason for stale or clashing requests, which is cosmetic only. |
| AC7 | PASS | The rbac admin sweep (introspected) includes `resendEvent`. `admin-resend.test.ts`, "plain users get FORBIDDEN and guests UNAUTHENTICATED; nothing changes". |
| AC8 | PASS | `resendEvent` takes `{ eventId: v.id("automationEvents") }` only. First-pass probe R1: extra `role`/`isAdmin` args are rejected by the validator. |
| AC13 | PASS | The lifecycle is unchanged. A resend adds no row and keeps the key `<loanId>:<type>` (`admin-resend.test.ts`, "re-queues the same row, delivers it once, and marks it sent"). |
| AC17 | PASS | The `automation.test.ts` retry test is unchanged and green. `AdminEvents.tsx` `StatusCell` shows a Failed stamp, a plain-language hint and the stored (redacted) `lastError` (L20). Resend is offered only while the email still describes the loan, by the same rule as the server (`convex/lib/announces.ts`). Covered by `admin-resend.test.ts` 9/9. Not seen live, because the kickoff run had no failures. |
| AC18 | PASS | `no-secrets.test.ts` 11/11 (tracked and untracked files), plus the grep in R.0. |
| AC19 | PASS | `MyRequests.tsx` builds Activity with `lib/ledger.ts`. Live: `04` shows the EMAIL rows and `08` shows "REMINDER Overdue reminder sent to you". The red failed-email notice appears only while that email is still current (L16). Unit: `my-requests-email-status.test.ts`. |
| AC20 | PASS | `readme.test.ts` 6/6. The heading check accepts "minimi[sz]ation". The production note has a "Names" item. `docs/ARCHITECTURE.md` is updated (L19, and the `:49`/`:262` nits this pass). |

### R.3 Live evidence: `npm run test:kickoff` (run by the human, 2026-11-07; PASSED at 18:08 and again at 20:18 on the final code after the L15–L29 fixes)

| Screenshot | What it shows | Verdict |
|---|---|---|
| `01-lender-my-listings.png` | Ben C. lists two tools: AVAILABLE stamps, "Nobody has asked yet.", and the flash message "QA spare ladder … is on the board." The form has labels, a fieldset for Condition and character counters. | PASS |
| `02-borrower-requested.png` | Maya R. on Browse: category chips, search, owner names as "Ben C."/"Jake T.", and the borrowing card stamped "PENDING · NOV 7–9" with "Ben will get an email shortly." | PASS |
| `03-lender-approved.png` | Incoming: calendar strip with a TODAY marker, APPROVED stamp, "Maya will get an email.", and the loan under "Out on loan" with Mark returned. | PASS |
| `04-borrower-notification-sent.png` | My requests: both notification emails show as EMAIL (sent), in US date format. | PASS (AC19, sent display) |
| `05-admin-removed-and-trusted.png` | Admin: Automated emails all SENT "1 of 4". The spare ladder shows REMOVED "Hidden from the board". Ben C. is TRUSTED with Remove badge. Each neighbor shows a masked email and id suffix (e.g. `m***@example.com · #8hrs6v`, L25); the admin's own row is masked by the spec. | PASS (removal, Trusted, L25) |
| `06-borrower-trusted-badge.png` | Maya's Browse: "Ben C. TRUSTED LENDER" on the drill (Out on loan). The removed ladder is gone. | PASS (Trusted badge) |
| `07-public-page.png` | Public page, signed out (see AC1): the sample borrowing card is tagged EXAMPLE with non-seeded items (L21), and the borrow note reads "Signed-in neighbors see your name, never your email." (L24). | PASS |
| `08-borrower-reminder-sent.png` | The seeded overdue stand mixer from Olivia P.: "1 DAY LATE" banner, OVERDUE · 1 DAY tag and one REMINDER row. | PASS (overdue reminder) |

The failed-email display (the borrower's red notice, and admin Failed with Resend or "Out of date") does not appear in any screenshot, because nothing failed in the run. That path is covered by unit tests, probes and code review only.

The screenshots above are from the 20:18 run on the final code. The kickoff runs at desktop width, where the borrowing card is a side panel with no focus guards, so the L18, L27 and L29 sheet focus stays verified by the component probe only (R.6, fourth pass), and the L17 header gating and L28 resend focus by code review only.

### R.4 Security review (CLAUDE.md non-negotiables)

| # | Rule | Result | Evidence |
|---|---|---|---|
| 1 | Authorization in Convex | OK | There are 22 public functions; 21 call `requireUser`/`requireAdmin` first. `resendEvent` (`convex/admin.ts:113-116`) calls `requireAdmin` before any read. First-pass probe R2: a brand-new identity gets `FORBIDDEN`, and its `users` row rolls back. Frontend role use is cosmetic only: `AdminDashboard.tsx` (skips admin queries), `AppNav.tsx:44` (hides the Admin link) and `AppNav.tsx:64` (admin header look, gated on `me?.role === "admin"`). `seed.ts` is still `internalMutation` only, so the `retirePlaceholder` delete can't be reached by a client. |
| 2 | Role from the `users` table only | OK | No public function has a `role`/`isAdmin` arg; the only `role` validator is internal `users.setRole`. There is no `publicMetadata`/`sessionClaims` use. `auth.ts` and `users.ts` are unchanged. The header reads the role from `users.me`. |
| 3 | Public data projected | OK | `tools.listPublic` is unchanged. The public HTML contains no `ownerId`/`ownerName`/`ownerTrusted` (AC1 test). |
| 4 | No secrets in the repo | OK | See R.0 and R.1. `.env.local` and `n8n/.env` are git-ignored, and `.env.example` is unchanged. |
| 5 | Signed both ways | OK | `hmac.ts`, `http.ts` and the n8n workflows are unchanged. Re-run probe P4: a signed POST and a signed GET replayed after 6 minutes both get 401 with an empty body, and nothing is written. |
| 6 | Idempotent write-backs | OK | Unchanged. Re-run probe P5: the same reminder twice gives 200 and 200, with one row, unchanged. A resend reuses the notification row and key. |
| 7 | Mutations never call the network | OK | The only `fetch(` in `convex/` is `automation.ts` (internal action `deliver`). `admin.ts`, `seed.ts` and `lib/announces.ts` have none. `resendEvent` only reads, patches the row and calls `scheduler.runAfter(0, internal.automation.deliver)`. |
| 8 | Locked tests | OK | `.tests-locked` is present. Nothing under `tests/acceptance/` or `SPEC.md` changed. New tests are in `tests/unit/` and only add coverage. `qa/TEST-DISPUTES.md` has no entries. |

Grep results for the qa list (third pass; no Convex file changed in the fourth):
- no gated handler is missing `requireUser`;
- no role comes from args;
- no `fetch(` appears in a mutation;
- no secrets or non-example emails appear in JSON, fixtures or the changed files;
- the constant-time compare is unchanged (full-length XOR in Convex, `timingSafeEqual` in n8n);
- the HTTP actions are unchanged, with the 5-minute window in place.

`resendEvent` (`convex/admin.ts:117-132`) refuses, in order:
- `NOT_FOUND` for a missing event;
- `INVALID` for `overdue_reminder` rows;
- `CONFLICT` for `queued`/`sent` rows, so a double click schedules one job;
- `NOT_FOUND` when the loan is gone (probe R10);
- `CONFLICT` "This email is out of date: the request is now <status>." when the email no longer announces the loan's status. The map lives once in `convex/lib/announces.ts:4-15`, and a cancelled loan reads "canceled" (probe N1).

`attempts` is still not reset, so a resend that fails goes straight back to `failed` with no new retry chain. The error texts carry no names, emails or ids (probe R10 asserts this).

### R.5 Data minimisation

| Surface | Exposes | Verdict |
|---|---|---|
| `/` + `tools.listPublic` | `_id, name, category` of available, non-removed tools. The hero card is static text tagged EXAMPLE, with items the seed never lists. The copy reads "Signed-in neighbors see your name, never your email", which is true. | PASS |
| Convex → n8n body | `automation.ts` is unchanged: exactly the SPEC 6.1 fields, with the recipient's email only. Probe R5b: a resent cancellation carries `endDate, eventId, loanId, recipientEmail, recipientName, sentAt, startDate, toolName, type`, and the recipient is the borrower only. | PASS |
| `GET /n8n/overdue-loans`, `POST /n8n/reminder-status` | Unchanged (`http.ts` and `automation.ts` untouched). | PASS |
| `loans.listMine` | Unchanged. It has no email, key, error text or attempts (first-pass probe M1, and the unit test "leak no keys or errors"). | PASS |
| Signed-in UI | Names are shortened to "Ben C." in the UI only. Queries return full names but never emails. | PASS |
| Admin UI | `admin.listUsers` returns emails to admins, as before. The Neighbors table prints each one masked as `b***@example.com`, followed by `· #` and the last 6 characters of the user `_id`, which `listUsers` already returns to admins. The same text is in the Trusted button's hidden label. No full address is on screen. SPEC limits emails on the public page and in n8n payloads, and an admin-only masked address is within that. | PASS |

### R.6 Try to break it

First pass (17 throwaway `convex-test` probes, scratchpad only, all ran green):

| Probe | Result |
|---|---|
| P1 Request own tool | `FORBIDDEN`, 0 loans, 0 events |
| P2 Approve or decline someone else's request (stranger, borrower, admin) | `FORBIDDEN` for each; the loan stays `pending` |
| P3 Double-approve overlapping dates (inclusive edge) | Second approve gives `CONFLICT`; re-approving the first gives `INVALID` |
| P4 Replay a signed webhook (POST and GET) after 6 minutes | 401 with an empty body; no rows written |
| P5 Post the same reminder twice | 200 and 200, one row, identical |
| R1 `resendEvent` with `role:"admin"` / `isAdmin:true` | Rejected by the args validator; no change, no job |
| R2 `resendEvent` by an identity with no row | `FORBIDDEN`, and no `users` row is left behind |
| R3 Resend then deliver | Same row, same key, no new row |
| R4 Borrower cancels, then admin resends the failed "new request" email | First pass: the lender still received it (L15). **Now `CONFLICT`** (unit test "refuses a stale 'new request' email once the borrower has cancelled") |
| R5 Admin removes the tool, then resends the failed "new request" email | First pass: same as R4. **Now `CONFLICT`** (second-pass probe R5) |
| R6 `resendEvent` with a loan id | Rejected (table-typed id) |
| R7 `deliver` invoked again after a successful resend | `fetch` is called once |
| M1/M2/M3 | See R.5. 22 public functions; `seed:*` is internal |
| S1 `seed:neighbors` run, the neighbor signs in, then the script links Clerk ids | First pass: two rows with one `clerkId`, so every call threw (L22). **Now one row** (second-pass probe S1) |
| S2 Script first, then sign-in (the README order) | One row, reused correctly |

Second pass (10 throwaway probes in `<scratchpad>/qa/probes3/`, all ran green; re-run in the third pass, still green):

| Probe | Result |
|---|---|
| R5 "New request" email failed, then admin removes the listing | The loan becomes `cancelled`. Resend gives `CONFLICT`, the row stays `failed` and no job is scheduled |
| R5b The removal's cancellation email to the borrower (also failed) | Still current, so Resend works. The payload goes to the borrower only, with the SPEC 6.1 keys |
| R8 Failed decline email, resent after the decline | Allowed; the row ends `sent` |
| R10 Loan row deleted, then resend | `NOT_FOUND` "The loan for this email no longer exists."; the text has no name, email or id |
| R11 Failed approval email, resent after the return | `CONFLICT` "… the request is now returned." |
| S1 The first-pass probe, re-run | 1 row with Marcus's Clerk id, and `users.me` works |
| S3 After the S1 repair, run `seed:overdueLoan {}` (README step) | Second pass: the lender was the leftover placeholder, and a second "Stand mixer" appeared (L26). **Fixed in the third pass** (probe S3 below) |
| S4 Then run `seed:neighbors {}` again | Second pass: 8 tools instead of 6 (L26). **Now 6** |
| S5 Admin `listUsers` | Second pass: two identical Olivia rows (L26, L25). **Now one row** |
| P1–P5 re-run | Same results as the first pass, again in the third pass: `FORBIDDEN` with nothing written; `FORBIDDEN` x6 with the loan `pending`; `CONFLICT` then `INVALID`; 401 `""` for POST and GET; 200/200 with one identical row |

Third pass (`<scratchpad>/qa/probes4/`: 9 `convex-test` probes and one Chromium probe, all ran green):

| Probe | Result |
|---|---|
| S3–S5 re-run: placeholder, sign-in, link, then `seed:overdueLoan {}` and `seed:neighbors {}` | **Fixed.** The overdue loan's lender is the real Olivia, there is 1 Stand mixer and the real Olivia's Incoming shows 1 loan. There are 6 tools, and admin `listUsers` has 1 Olivia row |
| S7 Olivia signs in before any seed, then `seed:neighbors {}` runs twice | 1 Olivia row, which owns her 2 tools; 6 tools in total |
| S8 Placeholder, sign-in, then `seed:overdueLoan {}` with no link step | The lender is the real Olivia, and the placeholder is retired: 1 Olivia row, 1 mixer, 6 tools |
| S6 `seed:overdueLoan {}` runs before anyone signs in, so the placeholders hold the loan. Then Olivia and Jake sign in and the script links them | Both placeholders are kept, as designed, because loans point at them. Result: 2 Olivia rows and 2 Jake rows (now told apart by the id suffix). There are 7 tools with 2 Stand mixers: the placeholder's on loan and a new one available. The overdue loan stays on the placeholders, so the real Jake's My requests is empty. No two rows share a `clerkId`, and `users.me` works for both. Dev-only; now recorded in DECISIONS `:135` |
| S9 Admin marks the placeholder Olivia Trusted, then the link retires it | The placeholder is deleted and the real row is not Trusted, so the badge is lost. Dev-only; recorded in DECISIONS `:135` |
| S10 Olivia's row carries an old Clerk id (the Clerk user was re-created), and the script passes the new id | The real row is not re-linked. The next sign-in gets a new, empty row: 2 Olivia rows, with 0 tools on the new one. Now documented as a deliberate choice in DECISIONS `:134` |
| N1 Admin resends a failed "new request" email after the borrower cancelled | `{"code":"CONFLICT","message":"This email is out of date: the request is now canceled."}` |
| N2 `isCurrentEmail` with `constructor`, `toString`, `__proto__`, `null` or a reminder date as the type | `false` for each. `loan.requested` with `pending` and `loan.cancelled` with `cancelled` give `true` |
| T1 Chromium at 390 px, on a copy of the third-pass `trapFocus` | Each date input has 4 tab stops: month, day, year and the picker. With Send enabled, focus stays inside and wraps both ways. **With Send disabled, Tab on Until's month field jumped to the close button**, skipping the other three stops (L29). Without any trap, Tab went through Until's 4 stops and then reached the page behind (L27) |
| V1 Dev deployment `users` table (read-only; only id suffixes and counts printed) | 9 rows with 9 distinct 6-character suffixes, 1 `seed_` placeholder, and no email on two rows. Every suffix starts with the same two characters, and the third takes only three values |

Fourth pass (`<scratchpad>/qa/probes5/`: the real `BorrowingCard`, bundled with esbuild and walked in headless Chromium):

| Probe | Result |
|---|---|
| G0 Open sheet at 390 px | `role="dialog"`, `aria-modal="true"`, and exactly 2 guards, which are the first and last child of the `aside` (`tabindex="0"`, `aria-hidden="true"`, opacity 0). Focus is on the title after open |
| G1 Send enabled, Tab ×11 from the title | `Title > From ×4 > Until ×4 > Send > Close > From`. Tab off Send, the last element, wraps to Close, the first |
| G2 Send enabled, Shift+Tab from Close | `Close > Send > Until`. Shift+Tab off the first element wraps to the last |
| G3 Shift+Tab from the title | `Close` |
| G4 Send disabled (Until set before From, so "The end date is before the start date."), Tab ×6 from Until | **`Until ×4 > Close > From ×2`**. All four Until stops (month, day, year, picker) are reachable, and then focus wraps to Close (L29 fixed) |
| G5 Send disabled, Shift+Tab ×5 from Close | `Close > Until > From ×4`. The wrap goes to Until, which is now the last element |
| G6 40 Tabs and 40 Shift+Tabs from the title, Send enabled and disabled | Focus only ever stops on Title, From, Until, Send (when enabled) and Close. In 160 key presses it never stops on a guard, never reaches the page behind (header link, chip, tool card, footer link) and never falls to `<body>` |
| G7 axe-core 4.14 on the open sheet | `aria-hidden-focus` is "needs review" for the two guards only. They pass a manual review, because focus never rests on them (G6). One minor violation, `aria-allowed-role`, is for `<aside role="dialog">` (nit, R.6a) |
| G8 Wide screen (1200 px) | No guards and no dialog role; the side panel is part of the page, as intended |

### R.6a Accessibility spot-check

- **Labels:** all present.
  - The search input, date inputs, ToolForm fields (with a `fieldset`/`legend` for Condition) and the "Show failed only" checkbox are labelled.
  - The icon-only close button has `aria-label`.
  - Chip and tab groups carry `role="group"` with `aria-label`.
  - Admin tables have a visually hidden `<caption>` and `scope="col"`.
- **State:** category chips, My requests filter tabs and tool cards use `aria-pressed`. Nav links use `aria-current="page"`.
- **Focus:**
  - There is a two-tone `:focus-visible` ring, plus a ring on hidden radio inputs via `.opt:has(input:focus-visible)`.
  - After send, approve, decline and return, focus moves to the result stamp (`tabIndex=-1`).
  - After Resend and Remove listing, focus moves to the cell wrapper (`tabIndex=-1`). Under "Show failed only", the resent row stays listed, so focus has a cell to land on (L28).
  - The mobile sheet behaves like this:
    - when closed, it is `inert`, which React 19.1.10 renders as `inert=""`;
    - when open, it is `role="dialog"` with `aria-modal="true"`. Focus guards at both ends keep Tab and Shift+Tab inside, and Tab inside the sheet is native, so date inputs keep all four stops (L27 and L29, probes G1–G6);
    - on open, focus moves to the card title; on close, it returns to the tool card that opened it.
  - Nits:
    - A backward wrap (Shift+Tab off Close) lands on Until's month field, because that is where `.focus()` puts it. The next Shift+Tab then goes to From, so Until's day and year are skipped going backwards. They are still reachable going forwards. This is cosmetic.
    - axe `aria-allowed-role` (minor): ARIA in HTML doesn't allow `role="dialog"` on `<aside>`. This has been there since the L18 fix. Render the sheet as a `div` or `section` while it is a dialog, or put the role on an inner wrapper.
- **Targets:** `.btn` (including `.btn-sm`), `.chip`, `.tab`, `.navlink`, `.field-input`, `.opt`, the Activity `summary` and the inline links all have a 44 px minimum height. `.btn-lg` is 52 px.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, `globals.css` turns off the stamp-press animation and the transitions on `.btn`, tag cards, `.sheet`, `.scrim` and the chevron. The spinner uses `motion-reduce:animate-none`.
- **Text:** ledger tags are text, not colour only. Disabled Approve, Delete and Request buttons are linked to their reason with `aria-describedby`.

### R.6b Grading criteria (brief)

- **Code structure:** good.
  - The backend changes are small and commented: `resendEvent` uses the shared `isCurrentEmail`, and `upsertNeighbor` prefers a real row and retires the placeholder with `retirePlaceholder`.
  - The sheet's focus handling is one small `FocusGuard` component plus `focusEdge`, with a comment saying why (`BorrowingCard.tsx:24-35`, `:85-95`).
  - The UI is split into small components with shared primitives and pure helpers (`lib/ledger.ts`, `lib/names.ts`, `lib/dates.ts`, `lib/loanEmail.ts`).
  - Resolved nit: the type→status map lives once in `convex/lib/announces.ts`, which has no imports. `convex/admin.ts:6` and `:129` use it, `lib/loanEmail.ts:2` re-exports it, and `AdminEvents.tsx` and `MyRequests.tsx` import it from there.
- **UX:** good.
  - Every list has loading, empty and error states.
  - Filters work: category on the server, search on the client, and the count is announced. A row resent under "Show failed only" stays visible with its new status.
  - The admin and the borrower get honest copy for out-of-date emails.
  - Resolved nit: the ToolForm placeholder is now "e.g. Leaf blower" (`ToolForm.tsx:75`), which is not in the seed, the hero card or the e2e spec.
  - Open nits:
    - **Activity cap (not changed, as agreed).** Activity is capped at 10 events (`convex/lib/views.ts:5`, `:60`). On a loan that is 10 or more days overdue, a failed approval email drops out of the list, and with it the red notice, even though `emailStatus` is `failed`.
    - "Asked Nov 7" is a UTC date, while the ledger times use local time.
    - `role="status"` wraps the action cells.
    - The two focus nits in R.6a.
- **Integration reliability:** good.
  - Retries are unchanged. Manual Resend is admin-only, idempotent and refuses out-of-date emails.
  - The automatic retry chain can still deliver a just-outdated email for about 12.5 min, which L15 accepted as bounded.
  - Resolved nit: the server message says "canceled" (`convex/admin.ts:130`, probe N1), matching the UI.
- **Docs:** good.
  - ARCHITECTURE (L19) and DECISIONS (L23) are fixed. The README has Design, test-user, resend and "Names" sections and an updated Data minimization section. `README.md:405-407` describes the mask and id suffix accurately (L25).
  - Resolved nits:
    - `ARCHITECTURE.md:49` lists both seed fixtures.
    - `:262` names "Admin → Automated emails" and the ledger's "Overdue reminder didn't go through".
  - DECISIONS records the Redesign-round choices:
    - `:112` (id suffix: "not guaranteed unique … about 1 in 100,000");
    - `:124`–`:126` (L26, L27 with focus guards and L29, L28) and `:127` (shared map);
    - `:134` (S10, no re-link) and `:135` (S6 and S9 are known dev-only edges, left as is).
- **Seed and admin nits:** all resolved or documented.
  - S6, S9 and S10 are recorded in DECISIONS (above).
  - The `AdminUsers.tsx:15-20` comment and DECISIONS `:112` no longer call the suffix unique. They give the odds instead: about 1 in 100,000 for a given pair, which matches the live data in V1.

### R.7 Findings (Redesign round)

No high or medium findings.

| ID | Severity | Status | Finding (short) | Evidence / fix |
|---|---|---|---|---|
| L15 | low | **resolved** | `resendEvent` resent stale notifications, e.g. "new request" after a cancel or removal. | `convex/admin.ts:126-132`: the handler loads the loan, gives `NOT_FOUND` if it is gone, and `CONFLICT` unless the email's type announces the loan's current status. Since the third pass, the map is in `convex/lib/announces.ts`. Unit tests "refuses a stale 'new request' email once the borrower has cancelled" and "resends a failed approval email while approved, but not after the return" pass (admin-resend 9/9). Probes R5, R5b, R8, R10, R11 and N1. UI: `AdminEvents.tsx:93-122` hides Resend for stale emails and says "Out of date: the request is now …". |
| L16 | low | **resolved** | The borrower's failed-email notice used the to-lender wording after the loan had moved on. | `MyRequests.tsx:62-80`: the notice shows only for a failed notification where `isCurrentEmail(type, status)` is true, with wording per type. Older failures stay as FAILED lines in the Activity ledger. Checked by code review; no test covers `FailedEmail` (nit). |
| L17 | low | **resolved** | Any user on `/admin` got the dark admin header, the ADMIN tag and "Signed in as an admin". | `AppNav.tsx:63-64`: `onAdminPage` requires `me?.role === "admin"` from `users.me`. `SignedInShell.tsx:14` falls back to the bare header if the header's queries fail. Not seen live. |
| L18 | low | **resolved** | The closed mobile sheet stayed focusable; opening it didn't move focus; focus dropped after Resend and Remove listing. | `BorrowingCard.tsx:70-83` and `:104-108`: the closed sheet is `inert` at ≤860 px, and the open one is a dialog with `aria-modal`. Focus goes to `#card-title` on open (probe G0) and back to the opener on close. After success, focus goes to `tabIndex=-1` wrappers in `AdminEvents.tsx` and `AdminTools.tsx`. |
| L19 | low | **resolved** | `ARCHITECTURE.md` had no `resendEvent` row, and some of its rows were stale. | Updated rows at `:42`, `:46`, `:70`, `:80`, `:87`, `:246` and `:252`. The leftovers at `:49` and `:262` are fixed this pass. |
| L20 | low | **resolved** | The raw `lastError` was only in a `title` tooltip. | `AdminEvents.tsx:124-127` renders the stored, redacted `lastError` under the hint whenever it differs from the hint. |
| L21 | low | **resolved** | The hero card used seeded tool names with loan stamps. | `HeroCard.tsx:5-9` uses Circular saw, Wheelbarrow and Camp stove, none of which are seeded; the card and footer carry an EXAMPLE tag. The ToolForm placeholder nit is fixed too ("e.g. Leaf blower"). |
| L22 | low | **resolved** | `seed:neighbors` could give two rows the same `clerkId`, which locked the user out. | A row that already has the real Clerk id wins, and the placeholder never gets that id. `seed-neighbors.test.ts` 3/3 and probe S1. Probe S6 confirms no shared `clerkId` even on the residual path. |
| L23 | low | **resolved** | DECISIONS said both "system fonts, no network" and `next/font/google`. | `DECISIONS.md:90` is struck through as superseded, and `:129` records the trade-off. |
| L24 | low | **resolved** | The public copy promised "first name and last initial", but shortening is UI-only. | `app/page.tsx:146` reads "Signed-in neighbors see your name, never your email." |
| L25 | low | **resolved** | The admin Neighbors table couldn't tell two people with the same short name apart, so the Trusted badge could go to the wrong person. | `AdminUsers.tsx:27-29`: `accountHint` is the masked email + " · #" + `user._id.slice(-6)`. It appears under each name (`:69`) and in the button's hidden label (`:34`, `:45`). A "no email" row gets the suffix too. `README.md:405-407` and `DECISIONS.md:112` describe it, with honest odds. Live: 9 users with 9 distinct suffixes (V1). |
| L26 | low | **resolved** | After the L22 repair, later fixture runs landed on the leftover `seed_` placeholder: a second mixer, the overdue loan on the ghost row, 8 tools and two Olivia rows. | `seed.ts:56-59` prefers a non-`seed_` row with the same email. `:61-64` uses it and calls `retirePlaceholder` (`:88-112`), which moves loan-free tools and deletes the placeholder when it has no tools left and no loans (`:111`). `seed-neighbors.test.ts:54-62` and probes S3–S5, S7 and S8: 6 tools, 1 mixer, the real Olivia is the lender, one Olivia row. The residual edges S6, S9 and S10 are documented in DECISIONS `:134-135`. |
| L27 | low | **resolved** | The mobile sheet said `aria-modal="true"`, but Tab and Shift+Tab reached the page behind the scrim. | Third pass: a Tab handler. Fourth pass: replaced by focus guards. `FocusGuard` (`BorrowingCard.tsx:24-35`) is rendered as the first and last child of the open modal sheet (`:111`, `:194`), and `focusEdge` (`:90-95`) sends focus to the other end, skipping the guards. Probe G6: in 160 key presses, focus never reached the page behind. |
| L28 | low | **resolved** | Under "Show failed only", a successful Resend dropped the row, so focus fell to `<body>` and "Resent just now" never showed. | `AdminEvents.tsx:144-146` keeps `resent[e._id]` rows in the failed-only list. The `<tr>` keeps its key and its `StatusCell` stays mounted, so `cellRef.current?.focus()` (`:110`) lands on the cell. Timing: Convex resolves the mutation promise in the same task that delivers the query update (`request_manager.js:101`, in `removeCompleted`, called at `client.js:220-223` before `notifyOnQueryResultChanges`), and `useQuery` re-renders through `useState` (`react/use_subscription.js`) at default priority. So `onResent()` and `focus()` run before the row's status changes. Code review only; not seen live. |
| L29 | low | **resolved** | The third-pass trap compared `document.activeElement` with the last focusable element. While Send was disabled, Tab on the "Until" month field wrapped to Close, so the day and year fields couldn't be reached with Tab. | `BorrowingCard.tsx` no longer handles Tab at all. Tab is native inside the sheet, and only a guard at an edge moves focus on (`:85-95`). Probe G4, real component with Send disabled: `Until ×4 > Close > From`, so all four Until stops are reachable before the wrap. G1 and G2: Send enabled wraps both ways. The DECISIONS `:125` line describes the guards and L29. |

Status of earlier findings: L11 was resolved in the first pass (`KICKOFF.md` is gone and history is one commit, `4c09b54`). Still open: L1, L2, L5 (D1), L6 (D2–D6; docker still has `TZ=Asia/Karachi`), L7, L9 and L10.

### R.8 Fixes required

None. Every AC passes, the protected areas are unchanged, and there are no high or medium findings. Every Redesign-round finding (L15–L29) is resolved without regressions: `npm run check` passes 146/146, Playwright passes 10/10, and the break-it probes P1–P5 still hold.

Done before merging: the human re-ran `npm run test:kickoff` on the final code and it passed; `05` and `07` now show the new admin and public UI.

Optional:
- the Activity cap;
- the two focus nits in R.6a (`aside` with `role="dialog"`, and the backward wrap into Until's month field);
- the older UX nits in R.6b.

---

# Earlier rounds (kept as written)

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

Result of that round (2026-11-06, with the 2026-11-07 live addendum): PASS. Superseded by the Redesign round at the top of this file.

## Overall result (2026-11-07, Redesign fourth pass)

Every AC passes, and there are no high or medium findings. L15–L29 from the Redesign round are all resolved. Open lows from earlier rounds: L1, L2, L5, L6, L7, L9 and L10.

RESULT: PASS
