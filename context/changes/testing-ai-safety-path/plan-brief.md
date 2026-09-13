# AI safety path — Plan Brief

> Full plan: `context/changes/testing-ai-safety-path/plan.md`
> Research: `context/changes/testing-ai-safety-path/research.md`

## What & Why

Lock AI check-in safety in CI: a down or rate-limited model must not block recording the month, garbage model JSON must not become a payment, and the 11th parse in an hour must be denied with a fallback signal. The product already does this; Vitest does not yet assert the failure modes that matter.

## Starting Point

`parse.test.ts` already returns 401/400/429/503/200 but never inspects `mock.calls` for payments or quota inserts. Schema tests miss negatives and mixed fail-closed. Save tests miss `amount: "-1"`. OTP has no app limiter — deferred.

## Desired End State

`npm test` fails if parse writes `goal_payments`, if 429 still calls AI or inserts an attempt, if 503 does not burn quota, if invalid input consumes quota, if 429/503 drop `code` or the manual-path hint, if Zod accepts a negative/mixed payload, or if save upserts junk amounts. §6.5 becomes the AI-safety cookbook.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Fallback proof | Handler `code` + manual-path copy | UI keys those codes; no jsdom/Playwright | Plan |
| Risk #5 depth | Schema unit + parse-checkin + save handler | Cheapest layers from research; skip extra 503 and payment-validation unit | Research / Plan |
| Quota lock | Insert/AI side effects on 400, 429, and 503 | Challenges “a table means the limit fires” | Research / Plan |
| OTP | Cookbook/§7 note only | No app limiter; fake Auth would not prove FR-034 | Research / Plan |
| Parse vs save | Keep decoupled tests | Phase 1 rule; 200 parse is not a save | Research |
| Oracle | PRD FR-034–036, not validator snapshots | Avoid tautological tests | Research |

## Scope

**In scope:** Extend `parse.test.ts`, `parse-schema.test.ts`, `parse-checkin.test.ts`, `check-in.test.ts`; fill test-plan §6.5 / §6.6 / §7 OTP note.

**Out of scope:** Product changes, React tests, OTP Vitest, Playwright, MSW, handler 503 for schema-invalid JSON, `payment-validation` `"-1"` unit, 11 sequential live inserts.

## Architecture / Approach

Reuse `createApiContext` + `createSupabaseMock` + `mockAiRun`. Parse uses JSON; save uses FormData. Assert `method === "insert"` on `ai_checkin_requests` (count queries also `from` that table). No harness growth.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Parse no-write + quota | #4/#6 in `parse.test.ts` | Confusing count `from` with insert |
| 2. Invalid payload | #5 schema, orchestration, save 400 | Snapshotting Zod as the oracle |
| 3. Cookbook | §6.5 / §6.6 / §7 / §3 complete | Rewriting §1/§2 (already backported) |

**Prerequisites:** Research complete; §2 guidance already backported.
**Estimated effort:** ~1 session across 3 phases (same shape as Phases 1–2 of the test rollout).

## Open Risks & Assumptions

- Queue order in `parse.test.ts` must stay aligned with insert-before-AI or tests underflow.
- Concurrent check-then-insert races are not proven (mock is sequential).

## Success Criteria (Summary)

- CI fails if parse records a payment or if quota/fallback contracts regress.
- CI fails if negative/mixed AI JSON becomes proposals or save upserts `"-1"`.
- A later agent can follow §6.5 without this plan.
