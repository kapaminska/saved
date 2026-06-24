<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Check-in + Safety

- **Plan**: context/changes/ai-checkin-safety/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-06-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING ⚠️ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | WARNING ⚠️ |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ |
| Success Criteria | WARNING ⚠️ |

## Findings

### F1 — Workers AI model ID differs from plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/goals/ai-checkin/parse-checkin.ts:4
- **Detail**: Plan specifies `@cf/meta/llama-3.1-8b-instruct`; implementation uses `@cf/meta/llama-3.1-8b-instruct-fp8` because the base model was deprecated (May 2026). Required for local/production calls to succeed.
- **Fix**: Document the model change in plan addendum (or update Phase 2 contract). No code revert — fp8 is correct.
- **Decision**: PENDING

### F2 — AI binding access path differs from plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/check-in/parse.ts:2, src/env.d.ts:9
- **Detail**: Plan says `context.locals.runtime.env.AI`; implementation uses `import { env } from "cloudflare:workers"`. `env.d.ts` documents this pattern from Phase 1.
- **Fix**: Update plan Phase 3 contract to match `cloudflare:workers` env import (documented convention).
- **Decision**: PENDING

### F3 — Rate-limit check is non-atomic

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/goals/ai-checkin/rate-limit.ts:14–18, 45–49
- **Detail**: `checkRateLimit` then `recordParseAttempt` are separate queries. Concurrent parse requests can both pass the count check before either insert lands, briefly exceeding the 10/hour cap.
- **Fix A ⭐ Recommended**: Add a Postgres RPC or single transaction that counts and inserts atomically.
  - Strength: Closes the race without changing API contract.
  - Tradeoff: Requires a migration + RPC function.
  - Confidence: HIGH — standard pattern for sliding-window limits.
  - Blind spot: Haven't load-tested concurrent requests.
- **Fix B**: Accept for MVP; document as known limitation.
  - Strength: No schema change.
  - Tradeoff: Abuse window remains under burst traffic.
  - Confidence: HIGH for MVP scope.
  - Blind spot: None significant.
- **Decision**: PENDING

### F4 — Rate-limit DB errors return 429

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/goals/ai-checkin/rate-limit.ts:20–22
- **Detail**: Supabase count query failures are treated as rate-limited (`ok: false`), causing HTTP 429 instead of 500. Transient DB errors block all AI check-ins with a misleading message.
- **Fix**: On query error, throw or return a distinct `{ ok: false, kind: "error" }` and respond 500 from the parse route.
- **Decision**: PENDING

### F5 — AI parse amounts lack upper bound

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/goals/ai-checkin/parse-schema.ts:7
- **Detail**: `z.coerce.number().gt(0)` accepts extremely large or non-finite values. `goal_payments.amount` is `numeric(12,2)` in Postgres.
- **Fix**: Add `.finite().max(9999999999.99)` (or align with existing payment validation max if defined).
- **Decision**: PENDING

### F6 — AI tab loading does not block modal close

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/goals/CheckInModal.tsx:32–35, src/components/goals/AiCheckInTab.tsx
- **Detail**: Parent `loading` covers manual save only. AI parse/save loading is isolated in `AiCheckInTab`, so the user can close the modal or switch tabs during in-flight AI requests (regression vs pre-tab modal).
- **Fix**: Lift AI loading via callback (`onLoadingChange`) and disable close/tab switch while AI requests run.
- **Decision**: PENDING

### F7 — Parse fetch ignores HTTP status before JSON parse

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/goals/AiCheckInTab.tsx:84–95
- **Detail**: `res.json()` is called without checking `res.ok`. Non-JSON error bodies (502 HTML) fall through to generic network-error paths.
- **Fix**: Check `res.ok` and branch on status; parse JSON only when content-type is JSON.
- **Decision**: PENDING

### F8 — Full-project lint still failing (pre-existing)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/components/auth/MagicLinkForm.tsx, GoalForm.tsx, etc.
- **Detail**: `npm run lint` fails on 7 pre-existing `@typescript-eslint/no-unnecessary-type-assertion` errors in unrelated components. New ai-checkin files pass eslint in isolation. Plan Progress items 1.3 and 2.2 remain unchecked.
- **Fix**: Run `eslint --fix` on affected files or relax rule project-wide.
- **Decision**: PENDING

### F9 — Goal names in LLM prompt without sanitization

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/goals/ai-checkin/parse-checkin.ts:34–46
- **Detail**: Goal names are interpolated into the system prompt. Adversarial goal names could inject prompt directives. Mitigated by human review screen before save.
- **Fix**: Strip newlines/control chars from goal names before prompt assembly.
- **Decision**: PENDING

### F10 — Duplicate MAX_TEXT_LENGTH constant

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/goals/AiCheckInTab.tsx:5, src/lib/goals/ai-checkin/nl-input-validation.ts
- **Detail**: Client hardcodes `500` instead of importing shared constant; client/server could drift.
- **Fix**: Export `MAX_CHECKIN_TEXT_LENGTH` from validation module and import in UI.
- **Decision**: PENDING
