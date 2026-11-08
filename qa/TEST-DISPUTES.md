# Test disputes

Builders: if a locked test is genuinely wrong, add an entry here and ask the human to unlock. Never edit the test yourself.

| Date | Test | Why it's wrong | Proposed fix | Resolved by |
|---|---|---|---|---|
| 2026-11-09 | `tests/acceptance/tools-public.test.ts` (AC2, line 104) | Old assertion `expect(tentRow.ownerName).toBe(ALICE.name);` required the full owner name ("Alice Lender"). Data minimisation for the security review: other users' names should leave the server as first name + last initial, which is all the Browse screen shows, so the full name must not be in the client response. | New assertion `expect(tentRow.ownerName).toBe("Alice L.");` (CONTRACT.md `tools.list` updated to match). | Approved by the human (they removed `.tests-locked`); applied by the tester; lock recreated. |
