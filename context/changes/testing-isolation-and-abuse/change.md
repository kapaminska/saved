---
change_id: testing-isolation-and-abuse
title: Isolation and abuse — ownership tests for goals, payments, and assets
status: impl_reviewed
created: 2026-09-04
updated: 2026-09-07
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Isolation and abuse".
Risks covered: #3 Authenticated user A can read or mutate user B’s goals, payments, or net worth. Test types planned: integration (+ RLS in CI if research confirms it is the proof).
Risk response intent: Risk #3 — prove User B gets empty/404 on user A’s ids (read and write) for goals, payments, and assets; challenge "being logged in is enough"; avoid testing only 401 when logged out.
After creating the folder, follow the downstream continuation rule.
