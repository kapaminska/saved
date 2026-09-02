<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Meaningful unit and API test coverage

- **Plan**: `context/changes/test-coverage/plan.md`
- **Scope**: Phase 1–4 of 4
- **Date**: 2026-09-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Parse handler has no 503 for unparsable model text

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/api/check-in/parse.test.ts`
- **Detail**: Plan asked for 503 `AI_UNAVAILABLE` when `env.AI.run` rejects or returns unparsable text. Tests cover reject only. Garbage JSON is covered in `parse-checkin.test.ts` as `invalid_response`, but the HTTP mapping is untested at the handler.
- **Fix**: Add one parse-route case: `mockAiRun` resolves `{ response: "not json" }`, assert status 503 and `code: "AI_UNAVAILABLE"`.
- **Decision**: FIXED

### F2 — Payment delete has no 404 for invalid ids

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/api/goals/[id]/payments/[paymentId]/delete.test.ts`
- **Detail**: Plan listed 404 bad ids for payment mutations. Edit suite covers it; delete suite does not. Handler still UUID-checks in `delete.ts`.
- **Fix**: Copy the invalid-id 404 case from the edit payment tests onto the delete suite.
- **Decision**: FIXED

### F3 — Planned amount≤0 skip is unreachable

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/goals/ai-checkin/parse-checkin.ts` (loop skip) vs `parse-schema.test.ts`
- **Detail**: Zod `.gt(0)` rejects zero before the skip. Invariant is locked as fail-closed schema, not as a skipped payment. HTTP consequence: invalid payload → 503, not 200 with a dropped row.
- **Fix**: Leave as-is, or delete the dead `amount <= 0` continue in a later cleanup.
- **Decision**: FIXED (removed dead skip; schema still fail-closed)

### F4 — Parse 429 uses live Date.now for created_at

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/check-in/parse.test.ts:44`
- **Detail**: `created_at` is `Date.now() - 60_000`. The test only asserts 429 + `RATE_LIMITED` (driven by count 10), so it is not flaky today.
- **Fix**: Pin an ISO timestamp if you later assert `retryAfterMs`.
- **Decision**: FIXED

### F5 — Four handler suites never assert 401

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: goals `[id]`, abandon, payment edit, payment delete tests
- **Detail**: Check-in, parse, goals index, and harness cover 401. Dropping `if (!user)` on the other four routes would not fail CI. Production still returns 401.
- **Fix**: Add a one-liner 401 case per file if you want the same net as other handlers.
- **Decision**: FIXED
