---
description: Run the full LendLoop agent loop (tests first, parallel builders, QA, fix until PASS)
---

Run the LendLoop build loop. Follow CLAUDE.md and SPEC.md.

0. Create an empty file `.build-in-progress` (the stop gate uses it). Delete it only when QA passes or you are blocked on something only I can do.
1. **Scaffold** (you, the orchestrator), only if `package.json` does not exist yet:
   `npx create-next-app@latest . --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm` (answer prompts non-interactively), then install `convex @clerk/nextjs` and dev deps `vitest convex-test @edge-runtime/vm @playwright/test`. Add scripts: `check` = `tsc --noEmit && next lint && vitest run && next build`, `test:e2e` = `playwright test`. Do not run `npx convex dev` yourself; tell me when it is needed, because it requires my login.
2. **Tests first**: launch the `tester` agent. Wait until `.tests-locked` exists.
3. **Build in parallel**: launch `builder` agents at the same time for the slices `backend`, `frontend`, `n8n`. When backend and n8n are done, launch a `builder` for `docs`.
4. **QA**: launch the `qa` agent.
5. If `qa/QA-REPORT.md` ends in `RESULT: FAIL`, give each listed fix to a `builder` on the right slice, then run `qa` again. Repeat until `RESULT: PASS`. If a dispute appears in `qa/TEST-DISPUTES.md`, send it to `tester` first.
6. Finish with a short summary: ACs passed, decisions made, and the manual steps left for me (Clerk keys, `npx convex dev`, `docker compose up`, importing n8n workflows, setting env vars, recording the demo).
