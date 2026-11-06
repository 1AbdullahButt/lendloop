Exported n8n workflow JSON for LendLoop (n8n 2.47.1 export format, imported unpublished):

- `request-notification.json`: signed Convex → n8n webhook (Raw Body, HMAC verify, Switch on `type`, mock send, `200`/`401`/`400`).
- `overdue-reminders.json`: daily 09:00 or manual, signed `GET /n8n/overdue-loans`, mock reminder, signed `POST /n8n/reminder-status` per loan.
- `error-handler.json`: Error Trigger. Set it as the error workflow of the two above.

Setup, the env vars (names only) and the reasoning are in [`../README.md`](../README.md).

Before committing an export, work through the re-export checklist in `../README.md`. In short:
no `pinData`; no secrets, tunnel or Convex URLs, or webhook URLs with keys; no real email
addresses. Secrets are read from `$env` or from n8n credentials by name. The `no-secrets` test
checks this automatically.
