---
change_id: testing-ai-safety-path
title: AI safety path — AI failure degrades, never blocks or writes garbage
status: implementing
created: 2026-09-07
updated: 2026-09-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "AI safety path".
Risks covered: #4 AI is unavailable, invalid, or rate-limited and the user cannot record the month; #5 An out-of-contract AI proposal is persisted as a payment; #6 AI parse (or OTP send) can be triggered in a loop, burning quota without a fallback signal. Test types planned: unit + integration.
Risk response intent: Risk #4 — prove AI error / timeout / 503 still offers a working manual path and nothing is written; challenge "a 200 from parse means the month was recorded"; avoid e2e of the modal because it feels safer. Risk #5 — prove negative / unmatched / malformed AI payload never becomes a payment row; challenge "showing proposals means they are safe to save"; avoid snapshot of current validator output as the oracle. Risk #6 — prove the 11th parse in the window is denied with a fallback signal, and brute OTP does not multiply side effects unchecked; challenge "a rate-limit table means the limit fires"; avoid mocking the limiter to always allow.
After creating the folder, follow the downstream continuation rule.
