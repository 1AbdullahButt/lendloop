# n8n for LendLoop

n8n sends LendLoop's notifications and overdue reminders. It runs locally with `docker-compose.yml`
and talks to Convex over signed HTTP in both directions (SPEC §6).

| Workflow file | Name in n8n | What it does |
|---|---|---|
| `workflows/request-notification.json` | LendLoop: request notification | Webhook (Raw Body) → verify HMAC → Switch on `type` → compose message → mock send → `200`. Bad/stale/unsigned → `401`, empty body. Unknown `type` → `400`. |
| `workflows/overdue-reminders.json` | LendLoop: overdue reminders | Daily 09:00 (or manual) → signed `GET /n8n/overdue-loans` → split → mock send → per item: signed `POST /n8n/reminder-status`. |
| `workflows/error-handler.json` | LendLoop: error handler | Error Trigger → one-line alert (workflow, node, error, execution id/url) → mock outbox, plus Slack/Discord if `ALERT_WEBHOOK_URL` is set. |

"Send" is a mock: each message is appended as one JSON line to the file in `LENDLOOP_MOCK_OUTBOX`
and also returned by the node, so it shows in the execution log. Swap the mock Code node for an
email node with an SMTP credential to send real mail.

## n8n version notes

The image is pinned to **`n8nio/n8n:2.47.1`** (the release Docker Hub's `stable`/`latest` tags pointed
at on 2026-11-04). It was checked against the n8n 2.47.1 source and the 2.0 breaking-changes docs:

- **Task runners are always on in 2.x.** Every Code node runs in a task runner. With
  `N8N_RUNNERS_MODE=internal` (set explicitly in compose; it is also the 2.x default) the runner is
  a child process of n8n in the same container, so `fs` writes land in the same `/home/node/.n8n`
  volume.
- **Builtin modules:** n8n passes `NODE_FUNCTION_ALLOW_BUILTIN` from the container to the internal
  runner. Compose sets it to `crypto,fs` and nothing else. In external mode this would instead
  have to go into the runners image's `/etc/n8n-task-runners.json`.
- **`$env`:** since 2.0, `N8N_BLOCK_ENV_ACCESS_IN_NODE` defaults to `true`. Compose sets it to `false`
  so Code nodes and expressions can read `$env.*`. The runner receives n8n's environment through
  the task broker, so the secrets only need to be in `n8n/.env`.
- **`this.helpers.getBinaryDataBuffer`** works inside the runner (it is proxied to n8n). The verify
  node uses it to read the raw body. In 2.x binary data may be stored on the filesystem rather
  than inline, and the helper handles both cases.
- **Activate is now Publish.** In 2.x the old Active toggle is the **Publish** button. Imported
  workflows arrive unpublished (`"active": false`).
- Internal mode is fine for a local instance holding mock data. It is deprecated from 3.0 and not
  recommended for production. See [Production changes](#production-changes).

If you upgrade the image, re-check these points before trusting the workflows.

## Environment variables (names only)

Copy `n8n/.env.example` to `n8n/.env` (git-ignored) and fill it in. `docker compose` reads it via `env_file`.

| Name | Used by | Value |
|---|---|---|
| `CONVEX_TO_N8N_SECRET` | request-notification (verify) | Same value as the Convex env var of that name. |
| `N8N_TO_CONVEX_SECRET` | overdue-reminders (sign) | Same value as the Convex env var of that name. |
| `CONVEX_SITE_URL` | overdue-reminders | `https://<deployment>.convex.site`, no trailing slash. This is the `.site` URL, not `.cloud`. |
| `WEBHOOK_URL` | n8n itself | Your public tunnel URL, so n8n shows the right production webhook URL. |
| `ALERT_WEBHOOK_URL` | error-handler (optional) | A Slack or Discord incoming-webhook URL. Leave it empty to use the mock outbox only. |

Compose also sets `N8N_RUNNERS_MODE`, `NODE_FUNCTION_ALLOW_BUILTIN`, `N8N_BLOCK_ENV_ACCESS_IN_NODE`,
`LENDLOOP_MOCK_OUTBOX` and execution-data pruning. None of these are secrets.

## Setup

### 1. Public URL (cloudflared tunnel)

Convex runs in the cloud and cannot reach `localhost:5678`. Start a tunnel first so you know the URL:

```bash
docker compose --profile tunnel up -d    # bundled cloudflared container, no install needed
docker compose logs tunnel               # find the https://<random>.trycloudflare.com URL
# or, with cloudflared installed:
cloudflared tunnel --url http://localhost:5678
```

Put that URL into `WEBHOOK_URL` in `n8n/.env`. The easiest way is
`node n8n/scripts/write-env.mjs --webhook-url <tunnel URL>`, which also copies both secrets from
Convex and derives `CONVEX_SITE_URL`, printing names only. A quick tunnel
gets a new URL every time it restarts. When that happens, update `WEBHOOK_URL`, restart n8n, and
redo step 6.

### 2. Start n8n

```bash
docker compose up -d
docker compose logs -f n8n     # wait for "Editor is now accessible via"
```

Open http://localhost:5678 and create the owner account.

### 3. Import the workflows

For each file in `n8n/workflows/`, go to **Workflows → Create workflow → ⋯ menu → Import from File…**
and save. No credentials need to be selected. All secrets come from `$env`.

### 4. Set the error workflow

The export cannot point at the error handler, because n8n gives each imported workflow a new id.
Set it by hand in **request-notification** and **overdue-reminders**: open the workflow, go to
**⋯ → Settings → Error workflow**, choose **LendLoop: error handler**, and save.

### 5. Publish (activate)

Publish **request-notification** and **overdue-reminders**. In 2.x, Publish is the old Active toggle.
The error handler does not need to be published. n8n runs it whenever a workflow that names it fails.

### 6. Point Convex at the webhook

Open the **Webhook** node in request-notification. Under **Production URL**, copy
`<WEBHOOK_URL>/webhook/lendloop-request`, not the `/webhook-test/` URL. Then run:

```bash
npx convex env set N8N_REQUEST_WEBHOOK_URL <that production URL>
```

The path is not a secret. Every request still has to carry a valid signature.

### 7. Try it

```bash
# Signed sample notification -> expect 200 and a new outbox line
node --env-file=n8n/.env n8n/scripts/signed-request.mjs notify <production webhook URL>
# Forged / stale / unsigned -> expect 401
node --env-file=n8n/.env n8n/scripts/signed-request.mjs notify <url> --bad-signature
node --env-file=n8n/.env n8n/scripts/signed-request.mjs notify <url> --stale
# Signed GET to Convex (emails are masked in the printout)
node --env-file=n8n/.env n8n/scripts/signed-request.mjs overdue
# Write-back idempotency: run twice, the second call changes nothing
node --env-file=n8n/.env n8n/scripts/signed-request.mjs reminder-status <loanId> <loanId>:<YYYY-MM-DD>
```

For the overdue flow, open **overdue-reminders** and click **Execute workflow**. This uses the
**Run manually** trigger. Each overdue loan gets one outbox line and one `reminder-status` POST.
Run it again: Convex skips loans already reminded today, so nothing is sent twice.

### Reading the mock outbox

```bash
docker compose exec n8n tail -f /home/node/.n8n/mock-outbox.log
```

Each line is a JSON object with a `channel` field: `request-notification`, `overdue-reminder` or
`error-handler`. Recipient addresses are masked (`a***@example.com`).

### Updating a workflow that is already imported

Importing the repo file again creates a **second** workflow: the file has no workflow id, and it
would also drop this instance's Error workflow setting. Instead, update the existing one in place:

1. Export the live workflow: `n8n export:workflow --id=<id> --output=/tmp/live.json` (ids from
   `n8n list:workflow`).
2. Build an import file from it: keep its `id`, `settings` (with `errorWorkflow`), and the Webhook
   node's `webhookId`; take `nodes` and `connections` from `n8n/workflows/*.json`.
3. `n8n import:workflow --input=<that file>` updates it in place, and deactivates it.
4. `n8n publish:workflow --id=<id>`, then `docker compose restart n8n` so the webhook registers.
5. Check: `n8n list:workflow` shows one workflow of that name, `--active=true` lists it, and a signed
   test (`notify <url> --type <type>`) gets 200. The webhook path and URL do not change.

The request-notification workflow handles six types: `loan.requested`, `loan.approved`,
`loan.declined`, `loan.returned`, `loan.cancelled` and `loan.dates_taken` (sent to a borrower whose
pending dates another approved loan just took). An unknown type gets 400, so Convex retries and
then marks it failed.

## Why Raw Body

The request-notification Webhook node has **Raw Body** turned on (`options.rawBody: true`). The
Verify signature Code node computes the HMAC over **those exact received bytes**
(`timestamp + "." + rawBody`). It reads them with `getBinaryDataBuffer(0, 'data')`, or from the inline
base64 if the helper is unavailable.

It never verifies `JSON.stringify($json.body)`. Re-serialised JSON is not guaranteed to match the
bytes Convex signed: key order, whitespace, number formatting and unicode escaping (`é` vs `é`)
can all change. Any difference would either reject genuine requests or tempt someone to "fix" it
with a weaker check. If the raw body is missing, the node rejects the request (`401`) instead of
falling back to the parsed body. After the signature passes, the payload is parsed from the same
verified bytes.

The outbound side follows the same rule in reverse. **Sign POST reminder-status** builds the JSON
string once and signs that string. **POST reminder status** then sends `$json.body` as a raw
`application/json` body, so Convex verifies exactly what was signed.

## Signing, retries and the 5-minute window

- Header names: `X-LendLoop-Timestamp` (ms) and `X-LendLoop-Signature: sha256=<hex>`. Node
  lowercases incoming header names, so the Code node reads `x-lendloop-timestamp` and
  `x-lendloop-signature`.
- Verification checks, in order: a numeric timestamp, `|now - ts| <= 5 min`, the
  `sha256=<64 lowercase hex>` format, then `crypto.timingSafeEqual` on two 32-byte buffers. Every
  failure answers `401` with an empty body. The reason only appears in the n8n execution log.
- A missing `CONVEX_TO_N8N_SECRET` throws instead of answering `401`. That is a misconfiguration,
  so the error workflow should raise an alert.
- GET requests sign the empty body (`"<ts>."`).
- Every HTTP Request node has `retryOnFail: true, maxTries: 3, waitBetweenTries: 10000` and a
  10 s timeout. A retry re-sends the request signed by the preceding Code node, so it reuses that
  timestamp. The worst case is 3 × 10 s timeouts + 2 × 10 s waits ≈ 50 s, well inside the 5-minute
  window.
- The POSTs go through **One at a time** (Loop Over Items, batch size 1), so each item is signed
  just before its own request. A long overdue list can never push a timestamp past the window.
- If the mock send fails for an item, the node does not throw. It posts `status: "failed"` with a
  short `error` (≤ 200 chars). If a Convex call still fails after 3 tries, the run stops and the
  error handler fires. The next run retries safely, because write-backs are idempotent by
  `idempotencyKey` (`<loanId>:<YYYY-MM-DD>`).

## Data minimisation

- The verify node passes on only the payload fields the message needs. Headers and the raw body
  stop there.
- Outbox lines and node outputs mask the recipient's address. Only a real email node would need
  the full address.
- The error handler collapses error messages to one line, caps them at 500 characters and redacts
  anything shaped like an email address.
- The Webhook node's own execution data still contains the full request, including one recipient
  email. Compose prunes execution data after 7 days (`EXECUTIONS_DATA_MAX_AGE=168`). In production,
  also set the workflow's **Save successful production executions** to *Do not save*.

## Re-export checklist (no secrets)

After changing a workflow in the UI, export it with **⋯ → Download** and replace the file in
`n8n/workflows/`. Before committing:

1. Delete `pinData`, or any pinned/sample output. It can hold real payloads and emails.
2. Search the file for `@`. The only addresses allowed are `@example.com`.
3. Confirm secrets and URLs appear only as `$env.*` references. That means no tunnel URL, no
   `*.convex.site`/`*.convex.cloud` host, no Slack/Discord hook URL, and no `?token=`/`?key=` query strings.
4. Any `credentials` entry must contain only `id` and `name`.
5. Keep `options.rawBody: true` on the Webhook node and the retry settings (3 tries, 10 000 ms) on
   every HTTP Request node.
6. Run `npx vitest run no-secrets`.

## Production changes

- Run task runners in **external mode** (`n8nio/runners` sidecar, version-matched) and move the
  builtin allow-list into the runner config. Internal mode shares n8n's uid, env and credentials.
- Replace the mock Code nodes with an email node using an n8n SMTP credential. Keep `fs` out of
  `NODE_FUNCTION_ALLOW_BUILTIN` once the outbox is gone.
- Use a named Cloudflare tunnel or a real domain, so the webhook URL stays stable.
- Deduplicate deliveries by `eventId`, for example with workflow static data. A replay of a
  captured request inside the 5-minute window, or a Convex retry after a lost response, then
  cannot send a second email.
- Don't save successful executions of request-notification, and rotate both HMAC secrets
  periodically. Rotate both sides together.
