# Critical-path coverage — assignment and payment integrity tests

## Overview

Add Vitest unit and integration tests that prove Risks #1 and #2 from `context/foundation/test-plan.md` cannot silently corrupt a month's data. No product code changes, no new test infrastructure, no e2e or component tests. Success is named behavioral invariants in CI, not a coverage percentage.

## Current State Analysis

Vitest harness exists (`src/test/api-route.ts`, global mocks in `vitest.setup.ts`). Nineteen `*.test.ts` files cover goals, net-worth, and API handlers. Payment validation and projection have unit tests; check-in handler tests cover auth and validation errors but **not** happy-path upsert `goal_id` or payment-integrity edge cases. Goal-name matching has unit tests but only happy-path and ambiguity-to-unrecognized cases.

Research (`research.md`) grounds the failure paths:

- **Risk #1**: Save (`POST /api/check-in`) persists client-submitted `goal_id` UUIDs; parse/review is a separate hop. Dashboard stays plausible when money lands on the wrong valid goal.
- **Risk #2**: `UNIQUE (goal_id, payment_month)` + upsert on check-in; skip = no row (0 in projections); explicit zero = row with `amount=0`; delete = row gone; future months rejected in `validateCheckInMonth`.

### Key Discoveries:

- `check-in.ts:82-96` upserts with `onConflict: "goal_id,payment_month"` — duplicate month overwrites, never creates two rows.
- `AiCheckInTab.tsx:52-57` drops `rawGoalName` before review — wrong `goalId` from parse is invisible on review (UX gap, not fixed here).
- `payment-validation.test.ts:32-45` covers future months at unit layer; handler layer untested.
- Asserting `matchGoalName("Wakacje", [wakacje]) → g1` is an implementation mirror — does not prove save fidelity.

## Desired End State

`npm test` fails if:

1. `/api/check-in` upserts a `goal_id` other than what the form submitted (multi-goal batch).
2. Same goal+month check-in overwrites via upsert (no duplicate row semantics).
3. Future `payment_month` returns 400 on check-in and payment edit.
4. Explicit `amount: "0"` creates/upserts a zero row; skipped goals produce no upsert call.
5. Adversarial `matchGoalName` cases document known ambiguity behavior (wrong unique fuzzy/exact).

After implementation, `context/foundation/test-plan.md` §6.1 and §6.2 contain cookbook patterns for duplicate-month and review-then-save assignment.

### Verification

- `npm test` passes locally and in CI (no new secrets or jobs).
- Each new test names the risk, regression, and anti-pattern avoided in a brief comment or `it` description.

## What We're NOT Doing

- Product/UX fixes (showing `rawGoalName` on review, server-side review artifact).
- React/component tests for `AiCheckInTab` or `CheckInModal`.
- E2E, Playwright, real Supabase, or folding `supabase/tests/*.sql` into `npm test`.
- Risk #3 (IDOR), Risk #4–#6 (AI safety) — later rollout phases.
- Coverage thresholds or new dependencies (MSW, jsdom).

## Implementation Approach

Extend existing colocated tests using `createSupabaseMock` queue pattern. **Risk #2 first** (payment integrity on check-in handler) — smaller surface, validates harness patterns. **Risk #1 second** (save `goal_id` fidelity + adversarial match). **Cookbook last** — backport patterns to test-plan §6.

Oracle source: test-plan risk response guidance and PRD data-integrity rules — not production code output.

## Phase 1: Payment month integrity (Risk #2)

### Overview

Prove same month cannot produce two rows, missing month semantics (skip vs zero), and future-month rejection at the API layer.

### Changes Required:

#### 1. Check-in future month rejection

**File**: `src/pages/api/check-in.test.ts`

**Intent**: Handler returns 400 when `payment_month` is in the future.

**Contract**: POST with a month strictly after today (use a far-future string like `2099-12` or compute from pinned date). Assert 400 and Polish error from `validateCheckInMonth`. No upsert calls in `mock.calls`.

**Regression caught**: Future month booked silently.

**Anti-pattern avoided**: Relying only on unit test of `validateCheckInMonth`.

#### 2. Check-in explicit zero

**File**: `src/pages/api/check-in.test.ts`

**Intent**: `amount: "0"` triggers upsert with `amount: 0`.

**Contract**: Queue active goal lookup + successful upsert + recalc. Assert upsert payload includes `amount: 0`. Distinct from skip.

**Regression caught**: Zero treated as skip or rejected.

**Anti-pattern avoided**: Happy-path-only positive amount.

#### 3. Check-in skip (no row)

**File**: `src/pages/api/check-in.test.ts`

**Intent**: Empty/whitespace amount for a goal omits that goal from upsert loop.

**Contract**: Form with two goals, one empty amount. Assert upsert called once for the non-empty goal only.

**Regression caught**: Empty amount creates spurious row or corrupts totals.

#### 4. Check-in duplicate month (upsert overwrite)

**File**: `src/pages/api/check-in.test.ts`

**Intent**: Second save same goal+month uses upsert, not a second insert.

**Contract**: Successful check-in; inspect `mock.calls` for `goal_payments` upsert with `onConflict` semantics (second call with different amount, same `goal_id` and `payment_month`). Assert handler returns 200 both times.

**Regression caught**: Duplicate rows for same goal+month.

**Anti-pattern avoided**: Single insert happy path only.

#### 5. Payment edit future month

**File**: `src/pages/api/goals/[id]/payments/[paymentId].test.ts`

**Intent**: Editing payment to future month returns 400.

**Contract**: Queue goal + payment fetch; POST with future `payment_month`. Assert 400, no update call.

**Regression caught**: Future month via edit path bypassing check-in validation.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- New cases in `check-in.test.ts` and `payments/[paymentId].test.ts` cover future month, zero, skip, upsert-overwrite

#### Manual Verification:

- None required

---

## Phase 2: Goal assignment on save (Risk #1)

### Overview

Prove save persists the `goal_id` the client submitted — independent of what parse would have guessed.

### Changes Required:

#### 1. Multi-goal check-in save

**File**: `src/pages/api/check-in.test.ts`

**Intent**: Two distinct `goal_id` + `amount` pairs upsert to correct goals.

**Contract**: Queue two active goals + two upserts + two recalcs. Form with parallel `goal_id` and `amount` arrays. Assert each upsert call's `goal_id` and `amount` match form input (via `mock.calls` inspection).

**Regression caught**: Wrong goal credited while totals look plausible.

**Anti-pattern avoided**: Testing only single-goal happy path.

#### 2. Save authoritative over parse (simulated correction)

**File**: `src/pages/api/check-in.test.ts`

**Intent**: POST save with `goal_id` = goal B proves handler does not re-derive from names.

**Contract**: Single test posting goal B's UUID with amount; no parse involved. Assert upsert targets goal B. (Documents that save contract is UUID-based; parse is separate concern.)

**Regression caught**: Server re-matching names on save (would be a product bug).

#### 3. Adversarial goal-name match cases

**File**: `src/lib/goals/ai-checkin/goal-name-match.test.ts`

**Intent**: Document behavior when AI returns a name that exact-matches the wrong goal among similar names.

**Contract**: Add cases: two goals where AI string exact-matches goal B when user might mean goal A; unique fuzzy false positive if applicable. Assert returned `goalId` — oracle is documented expected behavior per `matchGoalName` rules, not "whatever code returns."

**Regression caught**: Silent wrong assignment at parse time.

**Anti-pattern avoided**: Only testing `"Wakacje"` → wakacje goal (implementation mirror).

**Note**: These unit tests support parse-layer understanding; Risk #1 proof for persist is Phase 2.1–2.2.

### Success Criteria:

#### Automated Verification:

- `npm test` passes
- `check-in.test.ts` asserts upsert `goal_id` from form for multi-goal and single corrected-ID cases
- `goal-name-match.test.ts` has ≥1 adversarial case beyond happy path

#### Manual Verification:

- None required

---

## Phase 3: Cookbook backport

### Overview

Update `context/foundation/test-plan.md` §6 with patterns shipped in Phases 1–2.

### Changes Required:

#### 1. §6.1 Adding a unit test

**File**: `context/foundation/test-plan.md`

**Intent**: Document duplicate-month / future-month / zero-vs-skip unit+handler pattern.

**Contract**: Replace TBD with: when to use `payment-validation.test.ts` vs handler test; pin dates; oracle from PRD FR-015/FR-020 not code.

#### 2. §6.2 Adding an integration test

**File**: `context/foundation/test-plan.md`

**Intent**: Document review-then-save assignment pattern.

**Contract**: Replace TBD with: test `POST /api/check-in` with explicit `goal_id` arrays; use `mock.calls` on upsert; do not assert parse output against itself; multi-goal batch as minimum bar.

#### 3. §6.6 Per-rollout-phase notes

**File**: `context/foundation/test-plan.md`

**Intent**: Record what Phase 1 landed.

**Contract**: One bullet under §6.6 noting `testing-critical-path-coverage` and test files touched.

#### 4. §3 status

**File**: `context/foundation/test-plan.md`

**Intent**: Mark Phase 1 `complete` when all Progress items are `[x]`.

**Contract**: Status → `complete` after Phase 3.1–3.3 and tests green.

### Success Criteria:

#### Automated Verification:

- `npm test` still passes

#### Manual Verification:

- §6.1, §6.2, §6.6 read coherently with implemented tests

---

## References

- `context/foundation/test-plan.md` — Risks #1–#2, response guidance, Phase 1 definition
- `context/changes/testing-critical-path-coverage/research.md` — code anchors and gap analysis
- `src/test/api-route.ts` — handler test harness
- `context/archive/2026-09-02-js-test-baseline/` — prior harness rollout

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Payment month integrity (Risk #2)

#### Automated

- [x] 1.1 Check-in future month rejection test
- [x] 1.2 Check-in explicit zero amount test
- [x] 1.3 Check-in skip (no upsert for empty amount) test
- [x] 1.4 Check-in duplicate month upsert-overwrite test
- [x] 1.5 Payment edit future month rejection test

### Phase 2: Goal assignment on save (Risk #1)

#### Automated

- [ ] 2.1 Multi-goal check-in save with upsert goal_id assertions
- [ ] 2.2 Save-with-specific-goal_id (authoritative UUID contract) test
- [ ] 2.3 Adversarial goal-name-match unit cases

### Phase 3: Cookbook backport

#### Automated

- [ ] 3.1 Update test-plan §6.1 unit test pattern
- [ ] 3.2 Update test-plan §6.2 integration test pattern
- [ ] 3.3 Add §6.6 Phase 1 notes and mark §3 Phase 1 complete
