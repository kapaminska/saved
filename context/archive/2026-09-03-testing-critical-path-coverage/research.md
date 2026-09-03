---
date: 2026-09-03T11:07:00+02:00
researcher: Composer
git_commit: 317486ddbb8dfc5e5674d6d27d5dd2a4ecbea0be
branch: main
repository: kapaminska/saved
topic: "Rollout Phase 1 — Critical-path coverage (Risks #1 and #2)"
tags: [research, testing, goals, payments, check-in, vitest]
status: complete
last_updated: 2026-09-03
last_updated_by: Composer
---

# Research: Rollout Phase 1 — Critical-path coverage (Risks #1 and #2)

**Date**: 2026-09-03
**Researcher**: Composer
**Git Commit**: 317486ddbb8dfc5e5674d6d27d5dd2a4ecbea0be
**Branch**: main
**Repository**: kapaminska/saved

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` for Risks #1 and #2:

- **#1**: After save, each amount lands on the goal the user confirmed on review — not the name the model guessed.
- **#2**: Same month cannot produce two rows; a missing month is 0, not deleted history; future months are rejected.

Verify test-plan response guidance, locate failure paths in code, assess existing tests, recommend cheapest test layer.

## Summary

**Risk #1** splits across three decoupled layers: AI parse + `matchGoalName` (proposals with `goalId`), client-only review in `AiCheckInTab` (editable `goalId`/`amount`, `rawGoalName` dropped), and stateless save via `POST /api/check-in` (upserts by submitted UUID only). Wrong-goal bugs are most likely at parse/match time or if the user misses a wrong pre-selected goal; the dashboard stays plausible because totals still reconcile per goal. **Cheapest proof**: integration tests on `/api/check-in` asserting upsert `goal_id` from form (multi-goal + user-corrected IDs), plus unit adversarial cases for `matchGoalName` — not parser self-mapping.

**Risk #2** is enforced by `UNIQUE (goal_id, payment_month)` in the DB, upsert on check-in, app-layer conflict check on edit, and `validateCheckInMonth` for future-month rejection. Missing months count as 0 in projections; explicit zero is a row with `amount = 0`; delete removes history. **Cheapest proof**: extend `check-in.test.ts` and payment edit tests for future month, zero row, skip (no upsert), and upsert-on-conflict; unit tests in `payment-validation.test.ts` already cover future months.

**Test harness**: Vitest in Node with `createApiContext` + queue-based `createSupabaseMock` (`src/test/api-route.ts`). No component tests, no MSW, no real Supabase in `npm test`.

**Response-guidance correction**: Risk #1 failure is a **two-hop** contract (parse assigns `goalId`; save persists client `goal_id`). Phase 1 must test save as source of truth separately from parse matching.

## Detailed Findings

### Risk #1 — Review → save goal assignment

#### Architecture (three decoupled layers)

1. **Parse** (`POST /api/check-in/parse`): AI output → `matchGoalName` → proposals with `goalId` or `unrecognized`.
2. **Review** (`AiCheckInTab.tsx`): Client state with editable `goalId`/`amount`; `rawGoalName` dropped before review.
3. **Save** (`POST /api/check-in`): Upserts by submitted `goal_id` UUIDs only — no re-parse, no name check.

**Critical invariant:** Save never sees AI output or `rawGoalName`.

#### Key files

| Step | File | Lines |
|------|------|-------|
| Parse API | `src/pages/api/check-in/parse.ts` | 13–88 |
| AI orchestration | `src/lib/goals/ai-checkin/parse-checkin.ts` | 78–136, 114–130 |
| Name → goalId | `src/lib/goals/ai-checkin/goal-name-match.ts` | 64–94 |
| Review UI | `src/components/goals/AiCheckInTab.tsx` | 52–57, 134–161 |
| Save handler | `src/pages/api/check-in.ts` | 32–62, 68–78, 82–96 |
| Recalc totals | `src/lib/goals/sync-saved-amount.ts` | 20–36 |

#### Failure modes (dashboard still plausible)

| Failure mode | Where | Why dashboard looks OK |
|--------------|-------|------------------------|
| AI picks wrong name from prompt list | `goal-name-match.ts` exact match | Money lands on valid active goal |
| Fuzzy/substring false positive | `goal-name-match.ts` 81–93 | Same |
| User doesn't notice wrong pre-selected goal | Review drops `rawGoalName` | Dropdown shows canonical name |
| Save trusts any owned active UUID | `check-in.ts` 68–78 | Deliberate reassignment works; accidental wrong UUID also succeeds |
| Duplicate `goal_id` in one save | Sequential upserts, same conflict key | Last amount wins |

#### Existing test coverage vs gaps

| Test file | Covers | Gap |
|-----------|--------|-----|
| `goal-name-match.test.ts` | Exact, substring, fuzzy, multi-match | No adversarial similar-name pairs |
| `parse-checkin.test.ts` | Matched + unrecognized split | Happy-path only |
| `check-in/parse.test.ts` | Auth, validation, rate limit | Asserts parser output, not save fidelity |
| `check-in.test.ts` | Auth, validation errors | **No happy-path asserting upsert `goal_id`** |
| `AiCheckInTab.tsx` | — | No component tests (no jsdom) |

### Risk #2 — Payment month integrity

#### Storage model

One row per goal × calendar month in `goal_payments`; `payment_month` normalized to `YYYY-MM-01`.

| User action | DB effect | Projection effect |
|-------------|-----------|-------------------|
| Skip (empty amount) | No row | Treated as 0 (`projection.ts` `?? 0`) |
| Explicit zero | Row with `amount = 0` | 0 in math; row visible in history |
| Delete | Row removed | 0 in projection; history gone |

#### Constraints and validation

- **DB**: `UNIQUE (goal_id, payment_month)`, `CHECK (amount >= 0)` — `supabase/migrations/20260623140000_create_goal_payments.sql`
- **Check-in**: upsert `onConflict: "goal_id,payment_month"` — `check-in.ts` 82–91
- **Edit**: pre-flight 409 on month collision — `payments/[paymentId].ts` 70–81
- **Future months**: `validateCheckInMonth` — `payment-validation.ts` 57–76 (unit-tested; not in API tests)

#### Existing test coverage vs gaps

| Scenario | Status |
|----------|--------|
| Future month via API | **Not tested** at handler layer |
| Duplicate month on check-in (upsert overwrites) | **Not tested** |
| Zero amount creates row | **Not tested** |
| Skip leaves no row | **Not tested** at API layer |
| Edit month collision | Covered (`payments/[paymentId].test.ts` 61–69) |
| Missing month = 0 in projections | Covered (`projection.test.ts` 78–82) |

### Vitest harness

- Config: `vitest.config.ts` — Node env, `src/**/*.test.ts`, `vitest.setup.ts` mocks `astro:env/server` + `cloudflare:workers`
- Pattern: import `POST` handler → `createApiContext` → `createSupabaseMock().queue()` → assert status + `mock.calls`
- **Cannot test**: workerd runtime, real RLS, React components, HTTP-level integration

## Code References

- `src/pages/api/check-in.ts:82-96` — upsert by `goal_id` + `payment_month`
- `src/lib/goals/ai-checkin/parse-checkin.ts:114-130` — match loop, unrecognized exclusion
- `src/components/goals/AiCheckInTab.tsx:52-57` — `rawGoalName` dropped in review
- `src/lib/goals/payment-validation.ts:57-76` — future month rejection
- `supabase/migrations/20260623140000_create_goal_payments.sql:10` — unique constraint
- `src/test/api-route.ts:89-155` — Supabase queue mock
- `src/pages/api/check-in.test.ts` — existing validation tests, no happy-path upsert assertion

## Architecture Insights

- Save is **authoritative** over parse: integration tests should POST save with specific `goal_id` values independent of parse output.
- Risk #1 product gap: `rawGoalName` discarded before review — silent wrong `goalId` from parse is invisible on review screen (out of scope for Phase 1 tests; document as known UX gap).
- Risk #2: DB unique constraint is declarative; app upsert path is the integration proof point — no need for real Supabase in CI.

## Historical Context

- `context/archive/2026-09-02-js-test-baseline/` — Vitest harness, queue mock, handler test pattern established.
- `context/changes/test-coverage/plan.md` — prior test rollout; harness phases largely complete.

## Response-Guidance Verification

| Risk | Test-plan guidance | Verified? | Notes |
|------|-------------------|-----------|-------|
| #1 | Integration handler + domain; challenge happy-path parse | Yes | Save path is separate from parse; test save `goal_id` directly |
| #1 | Avoid parser self-mapping | Yes | `goal-name-match.test.ts` alone insufficient |
| #2 | Unit + integration; challenge empty list = no corruption | Yes | Skip vs zero vs delete are distinct paths |
| #2 | Avoid happy-path-only insert | Yes | Need upsert, future month, zero, skip cases |

No speculative risks flagged for dropping. No hot-spot anchor corrections needed — cited dirs (`src/lib/goals`, `src/pages/api`, `supabase/`) match research findings.

## Open Questions

- Should Phase 1 add a chained parse→save test, or keep them decoupled? **Recommendation**: decoupled — cheaper, clearer oracle (form `goal_id` is independent contract).
- Component test for `AiCheckInTab` review UX? **Defer** — no jsdom; handler tests cover persist contract.
