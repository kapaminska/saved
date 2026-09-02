# JS Test Baseline Implementation Plan

## Overview

Add Vitest, a `npm test` script, at least one meaningful unit test of savings-goal projection math, and a CI step so 10xDevs “test presence” is met without standing up Playwright or duplicating SQL RLS scripts.

## Current State Analysis

There is no `*.test.*` / `*.spec.*` file and no test script in `package.json`. Meaningful logic already lives in pure functions. SQL RLS checks exist under `supabase/tests/` but a typical 10xDevs scan looks for a JS test runner.

### Key Discoveries:

- Projection API is exported from `src/lib/goals/projection.ts`: `requiredPace`, `projectedCompletionDate`, `goalStatus`, `computeGoalMetrics`, `formatMonthsOfData`, `averageMonthlyPayment`. No I/O.
- Archived S-03 plan called these functions “prime candidates when test framework lands”.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `astro sync`, `lint`, `build` — no test job. `on.push`/`pull_request` branches are `main` (not `master` as CLAUDE.md still says).
- Path alias `@/*` → `./src/*` (`tsconfig.json`). Vitest must resolve the same alias (`resolve.alias` in `vitest.config.ts`).
- ESLint uses typed `projectService`; test files need `import { describe, expect, it } from "vitest"` (no globals) unless we add a Vitest globals plugin — prefer explicit imports to avoid eslint/globals work.

## Desired End State

`npm test` runs Vitest in CI-friendly non-watch mode and exits 0. At least one test file asserts real projection behavior (pace, projected date, ahead/on_track/behind). GitHub Actions `ci` job fails if tests fail. SQL RLS scripts stay as-is.

**Verification:** `npm test` locally; CI log shows the Vitest step.

## What We're NOT Doing

- Playwright / E2E / login flows
- Testing React islands or API routes
- Putting RLS SQL into `npm test`
- Coverage gates
- Testing AI parse / rate-limit (out of this slice’s chosen target)

## Implementation Approach

One phase: add Vitest as a devDependency, config with `@` alias, `projection.test.ts` next to the module (or under `src/lib/goals/`), `package.json` `"test": "vitest run"`, CI step `npm test` after lint (before or after build — after lint, before build is enough).

## Phase 1: Vitest + projection tests + CI

### Overview

Install the runner, write projection tests, wire npm and GitHub Actions.

### Changes Required:

#### 1. Vitest config and dependency

**Files**: `package.json`, `vitest.config.ts` (new)

**Intent**: Provide a Vite-native runner that understands the repo’s `@/` imports.

**Contract**: Dev dependency `vitest`. Script `"test": "vitest run"` (not watch — CI must terminate). `vitest.config.ts` uses `defineConfig` from `vitest/config`. Alias `@` → `./src` (fileURL/path resolve). `test.include`: `src/**/*.test.ts`. Do not enable `globals: true`.

#### 2. Projection unit tests

**File**: `src/lib/goals/projection.test.ts` (new)

**Intent**: One meaningful suite — business rules from FR-017–FR-019, not `expect(1+1)`.

**Contract**: Import functions from `./projection`. Cover at least:

- `requiredPace`: `(target − saved) / months remaining`; `null` when no deadline or deadline in the past relative to `asOfDate`
- `projectedCompletionDate`: `null` when remaining ≤ 0 or average ≤ 0; otherwise first-of-month after ceil(remaining/average)
- `goalStatus`: `ahead` / `on_track` / `behind` / `null` when deadline or projection missing

Pin `asOfDate` (string `YYYY-MM-DD`) in every case — do not use `new Date()` without freeze, or tests flake.

#### 3. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Tests run on every PR/push that already lints and builds.

**Contract**: In job `ci`, add `run: npm test` after `npm run lint` and before `npm run build`. No extra secrets. Leave `deploy` job unchanged.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0
- `src/lib/goals/projection.test.ts` exists and imports from `./projection`
- `package.json` has script `test`
- `.github/workflows/ci.yml` contains `npm test`
- Lint passes: `npm run lint`
- Build still passes: `npm run build`

#### Manual Verification:

- Vitest output shows projection tests by name, not a placeholder suite
- README (if S-09 already merged) can mention `npm test`; if not, do not block this slice on README

**Implementation Note**: Pause for human glance at test names/output.

---

## Testing Strategy

### Unit Tests:

- Projection math and status classification as listed in Phase 1 contract
- Edge: zero average, completed remaining, missing deadline

### Integration Tests:

- Unchanged SQL RLS under `supabase/tests/` — not part of `npm test`

### Manual Testing Steps:

1. `npm test` from a clean `npm ci`
2. Confirm CI file has the step (or push a PR)

## Performance Considerations

Vitest on a handful of pure functions should finish in seconds. No app boot.

## Migration Notes

First test runner in the repo. Contributors need `npm install` after merge. CLAUDE.md still says CI is on `master` — optional one-line fix is out of scope unless the implementer is already in that file; do not expand to docs sweep.

## References

- Module under test: `src/lib/goals/projection.ts`
- Vitest config: `defineConfig` from `vitest/config`; `npm test` → `vitest` / `vitest run` (Vitest docs)
- CI: `.github/workflows/ci.yml`
- Change notes: `context/changes/js-test-baseline/change.md`
- Historical: `context/archive/2026-06-23-manual-checkin-payments-projections/plan.md` (tests deferred)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest + projection tests + CI

#### Automated

- [x] 1.1 `npm test` exits 0
- [x] 1.2 `src/lib/goals/projection.test.ts` exists and imports from `./projection`
- [x] 1.3 `package.json` has script `test`
- [x] 1.4 `.github/workflows/ci.yml` contains `npm test`
- [x] 1.5 Lint passes: `npm run lint`
- [x] 1.6 Build still passes: `npm run build`

#### Manual

- [x] 1.7 Vitest output shows projection tests by name, not a placeholder suite
- [x] 1.8 README (if S-09 already merged) can mention `npm test`; if not, do not block this slice on README
