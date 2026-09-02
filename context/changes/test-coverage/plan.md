# Meaningful unit and API test coverage

## Overview

Extend the existing Vitest baseline so money math, AI check-in parsing, and the check-in/goals API handlers have automated invariant tests in CI. Success is a named list of invariants, not a coverage percentage. Playwright, React islands, assets/liabilities/profile APIs, and folding RLS SQL into `npm test` stay out of this change.

## Current State Analysis

S-10 (`context/archive/2026-09-02-js-test-baseline/`) already shipped Vitest, `npm test` → `vitest run`, colocated `src/**/*.test.ts`, no `globals`, and a CI step after lint / before build. The only JS suite is `src/lib/goals/projection.test.ts`, and it does not cover `computeGoalMetrics` or related helpers.

SQL RLS scripts live under `supabase/tests/` and are manual (`psql`). They must stay out of `npm test`.

API routes are Astro `APIRoute` handlers. They are **not** gated by middleware; each handler checks `context.locals.user` and uses `getSupabase`, which prefers `locals.supabase`. That injection point is the intended test seam.

`src/pages/api/check-in/parse.ts` imports `env` from `cloudflare:workers` at module top level. `src/lib/supabase.ts` imports `astro:env/server`. Importing either module in Node Vitest will throw unless those specifiers are mocked in setup.

## Desired End State

`npm test` in CI fails if projection/net-worth/payment invariants, AI matching/schema/parse, or the check-in and goals lifecycle handlers regress on the cases listed below. A new contributor can run `npm test` without Docker, Cloudflare login, or extra secrets. README documents how to run RLS SQL locally and names a future Playwright slice (OTP + check-in) without implementing it.

### Key Discoveries:

- `getSupabase` returns `locals.supabase` when set (`src/lib/supabase.ts:56-62`) — API tests should set `locals.supabase` to a mock client and never call `createClient`.
- `POST` on `/api/check-in/parse` binds Workers AI via `import { env } from "cloudflare:workers"` (`src/pages/api/check-in/parse.ts:2,71`). Vitest must `vi.mock("cloudflare:workers")` before loading that module.
- `parseCheckInSentence` already takes `ai: Ai` as an argument (`src/lib/goals/ai-checkin/parse-checkin.ts:78-84`) — unit tests can pass `{ run }` without the parse route.
- `matchGoalName` treats multiple exact/substring/fuzzy hits as unrecognized (`src/lib/goals/ai-checkin/goal-name-match.ts:55-62,75-93`). Ambiguity is a money-safety invariant.
- Check-in upserts on `(goal_id, payment_month)` then `recalcSavedAmount` (`src/pages/api/check-in.ts:83-107`). Goal edit skips `opening_saved_amount` / `saved_amount` when any payment exists (`src/pages/api/goals/[id].ts:93-96`).
- Archived S-10: pin `asOfDate` strings; no Vitest globals; no coverage gates; do not put RLS into `npm test`.

## What We're NOT Doing

- Playwright / E2E (including OTP login). Next slice, not this one: happy path sign-in + monthly check-in against a running app.
- React island / RTL tests (`AiCheckInTab`, `GoalForm`, etc.).
- API tests for assets, liabilities, profile, or auth OTP routes.
- Running `supabase/tests/*.sql` inside `npm test` or adding a Docker/`supabase start` CI job.
- Coverage reports or coverage thresholds in CI.
- Extracting handler logic into new service modules just to make testing easier (test handlers as they are).
- Live Workers AI calls.
- Product features (multi-currency, bank import, etc.).

## Implementation Approach

Keep Vitest as the only JS runner. Add a setup file that mocks `astro:env/server` and `cloudflare:workers`. Add a small test helper that builds a minimal Astro `APIContext` (Request, `locals.user`, `locals.supabase`, `params`, cookies stub) and a chainable Supabase mock that can answer `.from().select().eq()…` with queued results.

Unit tests stay colocated (`foo.ts` → `foo.test.ts`). Handler tests colocate next to the route file (e.g. `src/pages/api/check-in.test.ts`) or live in `src/pages/api/check-in.check-in.test.ts` if the route filename would collide — prefer `check-in.test.ts` beside `check-in.ts` and `parse.test.ts` beside `parse.ts`.

CI already runs `npm test`; do not add secrets or jobs. Do not change the `deploy` job.

## Critical Implementation Details

**Module mocks must load first.** `vitest.setup.ts` should call `vi.mock("astro:env/server", …)` and `vi.mock("cloudflare:workers", …)` so any later import of `getSupabase` or `check-in/parse.ts` is safe. Export a mutable `mockAiRun` from the cloudflare mock so parse-route tests can set `env.AI.run` per case.

**Supabase client mock is thenable, not a single function.** Handlers chain `.from().select().eq().in().maybeSingle()` / `.upsert` / `.update`. The helper should return a proxy (or a small fake) where each chain step returns `this`, and terminal methods (`single`, `maybeSingle`, `then` if used) resolve `{ data, error, count }`. Queue responses per call in test order; fail the test if the queue underflows.

**Time.** Continue pinning calendar dates as `YYYY-MM-DD` strings in projection tests. For `checkRateLimit`, inject `limit`/`windowMs` already on the function; freeze `Date.now` only in those tests, not globally.

## Phase 1: Vitest harness

### Overview

Make it possible to import API routes and `getSupabase` under Node Vitest, and share one way to call `POST` handlers.

### Changes Required:

#### 1. Vitest setup

**File**: `vitest.setup.ts` (repo root) and `vitest.config.ts`

**Intent**: Register setup so env/Workers specifiers never hit the real runtimes during `npm test`.

**Contract**: `test.setupFiles` includes the setup file. Mock `astro:env/server` with dummy `SUPABASE_URL` / `SUPABASE_KEY` strings. Mock `cloudflare:workers` with `{ env: { AI: { run: vi.fn() } } }`. Leave `include: ["src/**/*.test.ts"]`. Do not enable `globals` or coverage.

#### 2. API context + Supabase mock helpers

**File**: `src/test/api-route.ts` (and a sibling mock helper if the file would be too large)

**Intent**: One factory for handler tests so each case does not reconstruct Astro context.

**Contract**: `createApiContext({ user, supabase, form?, json?, params?, url? })` returns an object satisfying what handlers read: `locals.user`, `locals.supabase`, `request` (`Request` with `formData` or `json`), `cookies` (no-op), `params`. `createSupabaseMock()` exposes `from` plus a `queue(result)` / `queueError` API. Helpers are test-only; do not import them from app code.

#### 3. Harness smoke

**File**: `src/test/harness.test.ts`

**Intent**: Prove the mocks work before writing domain tests.

**Contract**: Import `getSupabase` and a tiny handler (or call `createApiContext` + `POST` from `goals/index.ts` with no user) and assert 401 without throwing on env imports.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the existing projection suite and the harness smoke test
- `npx astro sync` is not required for `npm test` (handlers imported as TS modules)

#### Manual Verification:

- No new CI secrets or workflow jobs are needed for this phase

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Domain unit tests (money + AI)

### Overview

Cover pure and mocked-I/O functions that implement money correctness and AI check-in parsing. No HTTP.

### Changes Required:

#### 1. Finish projection

**File**: `src/lib/goals/projection.test.ts`

**Intent**: Cover the helpers that feed the dashboard, not only the three already tested functions.

**Contract**: Add cases for `averageMonthlyPayment` (zero-payment months in the window), `countGoalLifetimeMonths` / window start at earliest payment vs `created_at`, and `computeGoalMetrics` composing pace / projection / status. Pin `asOfDate`. Do not use unfrozen `new Date()` for calendar assertions.

#### 2. Goal and payment validation

**File**: `src/lib/goals/validation.test.ts`, `src/lib/goals/payment-validation.test.ts`

**Intent**: Lock parsers that gate create/edit/check-in before any DB write.

**Contract**: Goal name 1–100; target > 0; saved default/≥0; deadline normalized to first of month or null. Payment amount ≥0 with ≤2 decimals; month → `YYYY-MM-01`; check-in month not in the future relative to injected `today`.

#### 3. Net worth compute + validation

**File**: `src/lib/net-worth/compute.test.ts`, `src/lib/net-worth/validation.test.ts`

**Intent**: Keep the motivational NW panel from showing a wrong total or wrong stale/headline copy.

**Contract**: Net worth = assets − liabilities. `isAssetStale` uses the 3-calendar-month rule with a pinned `now`. Headline uses “Wasza…” for married/partnership. Amount/name/category parsers match `validation.ts`.

#### 4. Recalc saved amount

**File**: `src/lib/goals/sync-saved-amount.test.ts`

**Intent**: Denormalized `saved_amount` is `opening_saved_amount + Σ payments`; failures must not look like success.

**Contract**: Mock client: happy path returns updated goal; each of the three query failures returns `{ ok: false }`.

#### 5. AI check-in lib

**Files**: `src/lib/goals/ai-checkin/goal-name-match.test.ts`, `parse-schema.test.ts`, `nl-input-validation.test.ts`, `parse-checkin.test.ts`, `rate-limit.test.ts`

**Intent**: Wrong goal matching or swallowed bad AI JSON must fail in CI. Do not call Workers AI.

**Contract**:
- `matchGoalName`: case/diacritics exact match; substring; Levenshtein within cap; **ambiguous multi-match → unrecognized**; empty / no goals → unrecognized.
- `parseAiResponse`: valid payments array; `safeParse` failure → `{ ok: false }`.
- `validateCheckInText`: empty and >500 chars fail; trimmed success.
- `parseCheckInSentence`: fake `ai.run` returning JSON, fenced ```json, amount ≤0 skipped, `ai_error` on throw, `invalid_response` on garbage.
- `checkRateLimit`: under limit → remaining; count ≥10 → not ok; query error → not ok. `recordParseAttempt` throws when insert errors.

### Success Criteria:

#### Automated Verification:

- `npm test` runs all new colocated unit files and passes
- `npm run lint` passes on new test files

#### Manual Verification:

- Skim the new files: every listed invariant above has at least one `it(...)` (no coverage tool)

---

## Phase 3: Check-in and goals API handler tests

### Overview

Call exported `POST` handlers with `createApiContext` and the queued Supabase mock. Assert HTTP status and JSON `success` / `code` / `completedGoals`.

### Changes Required:

#### 1. Check-in save

**File**: `src/pages/api/check-in.test.ts`

**Intent**: Saving a monthly check-in is the money write path.

**Contract**: 401 without user. 400 invalid month, mismatched goal/amount fields, empty entries, bad UUID. 404 when active-goal fetch count ≠ unique ids. 500 on upsert or recalc failure. 200 with `completedGoals` when recalc returns `status: "completed"` and prior status was `active`. Queue mock so `.from("savings_goals")` then `.from("goal_payments")` then recalc queries match handler order.

#### 2. Check-in parse

**File**: `src/pages/api/check-in/parse.test.ts`

**Intent**: Auth, validation, rate limit, NO_GOALS, and AI failure codes stay stable for the client.

**Contract**: 401 unauthenticated. 400 `INVALID_INPUT` (empty/oversize). 429 `RATE_LIMITED` when `checkRateLimit` fails (mock the table count). 400 `NO_GOALS`. 503 `AI_UNAVAILABLE` when `env.AI.run` rejects or returns unparsable text. 200 with `proposals` / `unrecognized` on a well-formed `run` result. Do not hit a real model.

#### 3. Goals create / edit / abandon

**Files**: `src/pages/api/goals/index.test.ts`, `src/pages/api/goals/[id].test.ts`, `src/pages/api/goals/[id]/abandon.test.ts`

**Intent**: Lifecycle rules that protect `saved_amount` and status.

**Contract**: Create: 401; 400 validation; 200 insert sets both `saved_amount` and `opening_saved_amount` (assert payload passed to `insert` if the mock records it). Edit: 404 bad UUID / missing row; 409 if not `active`; when payment count > 0, update payload omits opening/saved. Abandon: 409 if not active; 404 missing.

#### 4. Payment edit / delete

**Files**: `src/pages/api/goals/[id]/payments/[paymentId].test.ts`, `.../delete.test.ts`

**Intent**: Payment mutations always recalc; inactive goals conflict.

**Contract**: 404 bad ids; 409 non-active goal; 409 month collision on edit; 500 if recalc fails; 200 success path calls recalc after mutate (mock records that `savings_goals` update for `saved_amount` ran).

### Success Criteria:

#### Automated Verification:

- `npm test` includes all handler tests and passes
- `npm run lint` passes
- CI still uses the existing `npm test` step (no workflow edit unless a test cannot run without it — default: no `ci.yml` change)

#### Manual Verification:

- Confirm CI on a PR would not need Docker or Wrangler login for tests (review workflow: lint → test → build unchanged)

---

## Phase 4: Documentation

### Overview

Document the test pyramid we actually have, how to run RLS by hand, and the Playwright follow-up so the next slice is obvious.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Contributors know `npm test` is unit+handler Vitest, not E2E, and how to run RLS.

**Contract**: Under commands or a short Testing section: `npm test` = Vitest, no watch. Point to `supabase/tests/*.sql` with the existing `psql` usage from those file headers. One paragraph: Playwright OTP + check-in is a future slice, not in this repo yet.

#### 2. Agent commands

**File**: `CLAUDE.md`

**Intent**: Agents see `npm test` next to lint/build.

**Contract**: Add `npm test` to the Commands list. Do not rewrite the Module 2 lesson block.

### Success Criteria:

#### Automated Verification:

- Markdown files format cleanly if `npm run format` is run on them

#### Manual Verification:

- A new reader of README can tell: how to run JS tests, that RLS is manual, that E2E is not here yet

---

## Testing Strategy

### Unit Tests:

- Projection metrics, validators, net-worth, recalc, AI match/schema/parse/rate-limit (Phase 2)
- Pin dates; mock `Ai.run`; queue Supabase results for recalc/rate-limit

### Integration Tests:

- Handler tests in Phase 3 are in-process integration (real handler code, fake Supabase/AI). No live database.

### Manual Testing Steps:

1. `npm test` locally after each phase
2. Optional: run one RLS SQL file against local Supabase if Docker is already up (not required to close this change)
3. Do not add a Playwright smoke in this change

## Performance Considerations

Handler tests must not start workerd. Keep the Supabase mock O(queued responses). Avoid importing Astro’s full SSR app.

## Migration Notes

No schema or product behavior changes. Test-only files plus docs.

## References

- Prior baseline: `context/archive/2026-09-02-js-test-baseline/plan.md`
- Roadmap S-10: `context/foundation/roadmap.md`
- `src/lib/supabase.ts` (`getSupabase`)
- `src/pages/api/check-in.ts`, `src/pages/api/check-in/parse.ts`
- `src/lib/goals/ai-checkin/parse-checkin.ts`, `goal-name-match.ts`
- RLS scripts: `supabase/tests/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest harness

#### Automated

- [x] 1.1 `npm test` passes, including the existing projection suite and the harness smoke test — fd159aa
- [x] 1.2 `npx astro sync` is not required for `npm test` (handlers imported as TS modules) — fd159aa

#### Manual

- [x] 1.3 No new CI secrets or workflow jobs are needed for this phase — fd159aa

### Phase 2: Domain unit tests (money + AI)

#### Automated

- [x] 2.1 `npm test` runs all new colocated unit files and passes — cf1c29c
- [x] 2.2 `npm run lint` passes on new test files — cf1c29c

#### Manual

- [x] 2.3 Skim the new files: every listed invariant above has at least one `it(...)` (no coverage tool) — cf1c29c

### Phase 3: Check-in and goals API handler tests

#### Automated

- [x] 3.1 `npm test` includes all handler tests and passes — c62a105
- [x] 3.2 `npm run lint` passes — c62a105
- [x] 3.3 CI still uses the existing `npm test` step (no workflow edit unless a test cannot run without it — default: no `ci.yml` change) — c62a105

#### Manual

- [x] 3.4 Confirm CI on a PR would not need Docker or Wrangler login for tests (review workflow: lint → test → build unchanged) — c62a105

### Phase 4: Documentation

#### Automated

- [x] 4.1 Markdown files format cleanly if `npm run format` is run on them

#### Manual

- [x] 4.2 A new reader of README can tell: how to run JS tests, that RLS is manual, that E2E is not here yet
