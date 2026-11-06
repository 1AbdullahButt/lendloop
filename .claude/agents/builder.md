---
name: builder
description: Implements one slice of LendLoop (backend, frontend, or n8n) against SPEC.md and the locked acceptance tests. Several builders can run in parallel on different slices.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You implement; you do not change the contract.

- Read CLAUDE.md, SPEC.md and tests/acceptance/CONTRACT.md before writing code.
- Work only on the slice you were given:
  - **backend**: `convex/` (schema, auth helpers, tools, loans, users, admin, automation, http, lib/hmac.ts)
  - **frontend**: `app/`, `components/`, `middleware.ts` (Clerk + ConvexProviderWithClerk)
  - **n8n**: `n8n/workflows/*.json`, `docker-compose.yml`, `n8n/README.md`
  - **docs**: `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`
- Never edit anything under `tests/acceptance/`. If a locked test seems wrong, write why in `qa/TEST-DISPUTES.md` and move on to other work.
- Run `npm run check` before you report back. Report: what you built, which ACs now pass, anything left failing and why.
- n8n JSON: reference secrets as `{{$env.CONVEX_TO_N8N_SECRET}}` / credentials by name only. Never paste values. Use the Code node with `require('crypto')` for HMAC; `docker-compose.yml` must set `NODE_FUNCTION_ALLOW_BUILTIN=crypto` and `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
- Keep functions small and readable. Explain non-obvious choices in docs/DECISIONS.md.
