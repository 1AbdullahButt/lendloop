# LendLoop — rules for every agent

Read `SPEC.md` first. It is the source of truth. If the spec is unclear, write the question and your chosen answer in `docs/DECISIONS.md` and continue. Do not edit `SPEC.md`.

## Non-negotiables
1. **Authorization lives in Convex.** Every non-public query, mutation and action calls `requireUser(ctx)` (and `requireAdmin` where needed) from `convex/lib/auth.ts`. UI checks are cosmetic only.
2. **Role comes from the Convex `users` table only.** Never from client arguments or Clerk metadata.
3. **Public data is projected.** `tools.listPublic` returns `{ _id, name, category }` only.
4. **Secrets never touch the repo.** Use `.env.local`, Convex environment variables and n8n credentials/env. Never put a secret, token or real email into code, tests, fixtures or exported n8n JSON. `.env.example` lists names only.
5. **Webhooks are signed both ways** (HMAC-SHA256 over `timestamp + "." + rawBody`, constant-time compare, 5-minute window).
6. **Write-backs are idempotent** by `idempotencyKey`.
7. **Mutations never call the network.** They queue an `automationEvents` row and schedule an internal action.
8. **Locked tests.** Files under `tests/acceptance/` are written by the tester and locked (`.tests-locked`). A hook blocks every agent from editing them, and from editing `SPEC.md`. If a locked test is genuinely wrong, write the reason in `qa/TEST-DISPUTES.md` and ask the human. Only the human removes `.tests-locked`; then the tester fixes the assertion (never deletes or weakens it) and recreates the lock.

## Definition of done
`npm run check` passes (typecheck, lint, unit + convex tests, build), the Playwright public-page suite passes, and `qa/QA-REPORT.md` ends with `RESULT: PASS` written by the qa agent. Nothing is done before that.

## Style
- TypeScript strict. Small files. One Convex module per domain: `tools.ts`, `loans.ts`, `users.ts`, `admin.ts`, `automation.ts`, `http.ts`.
- Errors: `ConvexError({ code, message })` with codes UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, INVALID, CONFLICT.
- UI: Tailwind, minimal, accessible labels, empty/loading/error states.
- Comments explain *why*, not *what*.
- Record every non-obvious choice in `docs/DECISIONS.md` (one line each: decision, reason). The README's security section is built from it.
