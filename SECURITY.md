# LendLoop security

This file covers what is defended, where the code is, and how to check each claim in under a minute.
The longer reasoning is in the README's **Security** and **Data minimization** sections and in
[docs/DECISIONS.md](docs/DECISIONS.md).

In the commands, `$TUNNEL` is the current quick-tunnel origin (`docker compose logs tunnel | grep trycloudflare`).
`$APP` is the deployed site, or `http://localhost:3000` locally.

## Threat model

| Threat | Mitigation | Where in code | Test | How to verify yourself |
|---|---|---|---|---|
| Forged webhook (either direction) | HMAC-SHA256 over `timestamp.rawBody`, separate secrets per direction, constant-time compare | `convex/lib/hmac.ts`, `convex/http.ts`, n8n "Verify signature" node | `hmac.test.ts`, `http.test.ts` (AC15) | `node --env-file=n8n/.env n8n/scripts/signed-request.mjs notify "$TUNNEL/webhook/lendloop-request" --bad-signature` → 401 (`--unsigned` and `--stale` also 401; no flag → 200) |
| Replayed webhook, after the window | Timestamp must be within 5 minutes, else 401 with an empty body | `convex/lib/hmac.ts` `verify` | `http.test.ts` "GET replayed after 6 minutes -> 401" | `npx vitest run http -t "replayed"` |
| Replayed webhook, inside the window | n8n remembers sent `eventId`s for 24 h and drops a second delivery, logging it as a duplicate | n8n `request-notification.json` "Drop duplicate eventId" | `replay-dedupe.test.ts` | Run `node --env-file=n8n/.env n8n/scripts/signed-request.mjs notify "$TUNNEL/webhook/lendloop-request" --event-id same-1` twice: 200 both times; `docker compose exec n8n tail -n 2 /home/node/.n8n/mock-outbox.log` shows one email and one `duplicate` line |
| Privilege escalation | Role read only from the Convex `users` row; `requireUser` and `requireAdmin` run first; no `role` argument anywhere | `convex/lib/auth.ts`, `convex/users.ts` | `rbac.test.ts` (AC4, AC5, AC7, AC8) | `npx vitest run rbac` |
| Data leakage to other users | Queries return only what the screen shows; other users' names cut to first name + last initial; no other user's email reaches a browser | `convex/lib/public.ts`, `convex/lib/views.ts`, each query's projection | `projections.test.ts`, `tools-public.test.ts` | `npx vitest run projections tools-public` |
| Data leakage to admins | Admins get masked emails only (`b***@example.com`), never the full address or idempotency keys | `convex/admin.ts` `listUsers`, `listAutomationEvents` | `projections.test.ts` "admin" | `npx vitest run projections -t admin` |
| Data leakage on the public page | `tools.listPublic` returns exactly `{ _id, name, category }` | `convex/tools.ts` `listPublic` | `tools-public.test.ts` | `curl -s $APP/` and view the board; `npx vitest run tools-public` |
| Duplicate reminders | Key `<loanId>:<YYYY-MM-DD>` inserted once per deployment; already-reminded loans are skipped; n8n sends and writes back one loan at a time, so a failed write-back can't leave other sent reminders unrecorded | `convex/http.ts`, `convex/automation.ts`, n8n `overdue-reminders.json` | `http.test.ts` (AC16), `overdue-two-deployments.test.ts` | `npx vitest run http -t idempotent overdue-two` |
| Duplicate request emails | Key `<loanId>:<type>`; `deliver` skips any event that is no longer queued | `convex/automation.ts` | `automation.test.ts` (AC13), `admin-resend.test.ts` | `npx vitest run automation admin-resend` |
| Silent failures | 1 attempt + 3 retries, each attempt times out after 10 s; then `failed` with a redacted `lastError` shown to admins (the borrower sees a status only: sent, sending or failed); a cron fails or retries emails stuck in `queued` over 15 min; n8n error workflow | `convex/automation.ts`, `convex/crons.ts`, `n8n/workflows/error-handler.json` | `automation.test.ts` (AC17), `stuck-events.test.ts` | Stop n8n, request a tool, wait ~13 min: Admin → Automated emails shows FAILED with Resend |
| Secret leakage | Secrets only in `.env.local`, Convex env and `n8n/.env`; workflows read `$env.*`; repo is scanned | `.gitignore`, `.env.example`, `n8n/workflows/*.json` | `no-secrets.test.ts` (AC18) | `npx vitest run no-secrets` |
| n8n editor exposed through the tunnel | The tunnel points at an nginx edge that serves only `/webhook/*` and `/healthz`; everything else is 404 | `n8n/edge/nginx.conf`, `docker-compose.yml` | `edge-proxy.test.ts` | `curl -s -o /dev/null -w "%{http_code}" $TUNNEL/signin` → 404 |
| n8n editor on the LAN | Port 5678 is published on `127.0.0.1` only | `docker-compose.yml` `ports` | `edge-proxy.test.ts` | From another device, `http://<pc-ip>:5678` does not connect |
| Clickjacking, XSS, sniffing | Per-request nonce CSP with `'strict-dynamic'`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy | `lib/securityHeaders.ts`, `middleware.ts`, `next.config.ts` | `security-headers.test.ts` | `curl -sI $APP/ \| grep -iE "content-security\|x-frame\|referrer\|nosniff\|permissions"` |
| Request flooding / double-click | `loans.request` answers `CONFLICT` for a pending request of yours on the same tool with overlapping dates, and after 10 requests per user in a rolling hour | `convex/loans.ts` `request` | `request-guards.test.ts` | `npx vitest run request-guards` |
| Personal data in stored errors | Email-shaped text in reminder errors from n8n becomes `[redacted-email]` before it is stored and shown to admins | `convex/automation.ts`, `convex/lib/redact.ts` | `redact.test.ts` | `npx vitest run redact` |
| Mutation side effects on the network | Mutations only queue an `automationEvents` row and schedule an internal action | `convex/loans.ts`, `convex/automation.ts` | `automation.test.ts` "mutations never call fetch" | `npx vitest run automation -t fetch` |

The n8n editor and login page are reachable **only on http://localhost:5678** on the PC running
Docker. Through the tunnel URL, `/signin`, `/home/workflows`, `/rest/login` and `/` all return 404.
Only `/webhook/*` (signed) and `/healthz` get through.

## Demo-only choices

These are fine for a recorded demo and wrong for real users.

- **Quick tunnel.** `cloudflared --url` gives a random `*.trycloudflare.com` origin that changes on
  every restart, has no SLA and no ingress rules. That is why an nginx edge sits in front of n8n.
  After a restart, `N8N_REQUEST_WEBHOOK_URL` must be updated on both Convex deployments.
- **n8n runs on my PC.** Emails and reminders work only while the PC, Docker and the tunnel are up.
- **Demo accounts.** Five demo people (Ben, Maya, Marcus, Olivia, Jake) are real accounts on the
  Clerk development instance the live site uses. Their addresses are on `example.com` and appear
  in the seed and test scripts, so they are not secret. What protects them is that sign-in needs
  the password (sent with my application, never in the repo) and that Clerk's **test mode** is
  off, so the fixed test verification code doesn't work. The e2e run signs in with sign-in tokens
  made from the secret key, which don't need test mode. The admin account uses a different,
  non-test address. For real users: a Clerk production instance, where none of this applies.
- **Clerk development instance, with Device Trust off.** Dev instances show a "Development mode"
  badge and allow test sign-ins. Device Trust was turned off so the demo accounts can sign in from
  the recording browsers without email codes.
- **Mock email.** n8n writes each email to a mock outbox file (masked address) instead of sending.
- **Shared secrets.** Dev and production Convex share the HMAC secrets and the one n8n instance.
- **CSP switch.** `CSP_REPORT_ONLY=1` on Vercel turns the CSP into report-only, for the case where it
  blocks sign-in. It is unset (enforced) on the live site.

## Production

- **Stable n8n host.** n8n Cloud, or self-hosted behind a named Cloudflare tunnel or real domain,
  with ingress limited to `/webhook/*`, queue mode and external task runners.
- **Secrets per environment, rotated.** Separate HMAC secrets for dev and production. Accept two
  secrets (current and next) during a rotation, rotate both directions together, keep them in a
  secret manager.
- **Clerk production instance** on a custom domain, with bot protection and email verification.
- **Rate limiting** on `loans.request`, `tools.create` and the webhook routes (per user and per IP).
- **Audit log of admin actions.** Who removed a listing, granted Trusted Lender or changed a role,
  and when, in an append-only table shown to admins.
- **Alerting.** Page someone when an event reaches `failed`, when the error workflow fires or when
  the overdue job does not run, instead of relying on someone opening the admin page.
- **Healthcare deployments.**
  - Use only providers that sign a BAA (hosting, database, email, logging); check each one, since
    many free tiers do not.
  - Keep PHI out of the automation layer. The n8n payload carries only a tool name, dates and the
    recipient's name and email; anything clinical stays in the primary database and is linked, not
    copied.
  - Turn off n8n execution-data saving for webhooks, encrypt backups and set retention limits.
  - Keep access logs for every read of sensitive records, not only admin writes.
