# CI/CD AI code review pipeline

## Overview

Ship an advisory AI code-review pipeline for Saved!: an independent `packages/code-reviewer` package on Cursor SDK (local runtime), structured Zod JSON, a composite GitHub Action, PR comment + labels, and a small promptfoo matrix. Humans keep the last word. Product code is untouched.

## Current State Analysis

- CI today is [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml): lint, test, build, deploy on `main`. No review job.
- App AI is Workers AI in [`src/lib/goals/ai-checkin/parse-checkin.ts`](../../../src/lib/goals/ai-checkin/parse-checkin.ts), not an Agent SDK. JSON is extracted from model text with a fence/brace helper — reuse that pattern for Cursor `RunResult.result`.
- Root [`tsconfig.json`](../../../tsconfig.json) includes `**/*`; the reviewer package must be excluded so Astro typecheck does not own it.
- Default branch is `main` (not `master` from the course snippet).
- Requirements: [`requirements.md`](./requirements.md).

## Desired End State

- `git diff | npx tsx src/cli.ts` (from the package) prints a Zod-valid review JSON.
- Every PR to `main` runs `.github/workflows/ai-review.yml`, posts/upserts `<!-- ai-cr -->` comment, sets `ai-cr:passed` or `ai-cr:failed`.
- Retry: adding `ai-cr:review` re-runs the job; the label is removed at start.
- Job is green on valid JSON even when `verdict` is `fail`.
- `npm run eval` in the package runs promptfoo on an IDOR fixture across 2–3 Cursor models.

### Verification

- Local: `cd packages/code-reviewer && npx tsx src/cli.ts --diff-file fixtures/simulated.diff` with `CURSOR_API_KEY`.
- CI: open a PR and confirm Actions job + PR comment + label.
- Eval: `npm run eval` (workflow_dispatch or path filter), not on every product PR.

## What We're NOT Doing

- Required status check / merge block
- Claude Code Action, Vercel AI SDK, OpenRouter Agent SDK
- Cloud Cursor runtime, `autoCreatePR`, Marketplace action
- Product code changes
- Wiring the reviewer into `npm test` or the existing `ci` job
- Running `10x-impl-review-ci` as the CI harness

## Implementation Approach

Independent package (not an npm workspace) so `@cursor/sdk` native binaries stay off the app `npm ci`. Host owns labels; agent owns `read_plan` + `post_pr_comment`. Parse JSON from the result string; one follow-up turn if parse fails.

## Phase 0: 10x context

### Changes Required

- `context/changes/ci-cd-code-review/change.md`
- `context/changes/ci-cd-code-review/requirements.md`
- `context/changes/ci-cd-code-review/plan.md`

### Success Criteria

- Folder exists with identity, requirements, and this plan.

## Phase 1: Local reviewer package

### Changes Required

- `packages/code-reviewer/package.json` — type module; deps `@cursor/sdk`, `zod`; dev `tsx`, `promptfoo`, `typescript`
- `packages/code-reviewer/src/schema.ts` — five scored criteria + verdict + summary
- `packages/code-reviewer/src/extract-json.ts` — fence/brace extract + `safeParse`
- `packages/code-reviewer/src/prompt.ts` — system prompt and user prompt builder
- `packages/code-reviewer/src/review.ts` — `Agent.create` + send (retry turn), sandbox with fallback, usage logs
- `packages/code-reviewer/src/cli.ts`
- `packages/code-reviewer/fixtures/simulated.diff`
- Root `tsconfig.json` exclude `packages`; ESLint ignore `packages/**`
- Root `.env.example` documents `CURSOR_API_KEY` for local review only

### Success Criteria

- CLI prints valid JSON for the simulated diff when the API key is set.
- App `npm run lint` still ignores the package.

## Phase 2: Tools + GitHub side effects

### Changes Required

- `packages/code-reviewer/src/tools.ts` — `read_plan`, `post_pr_comment`
- `packages/code-reviewer/src/github.ts` — comment upsert, label swap, retry-label delete
- CLI applies labels after a successful parse; skips GitHub when `SKIP_GITHUB=1` or token/PR missing

### Success Criteria

- Comment marker `<!-- ai-cr -->` is upserted, not duplicated.
- Labels are mutually exclusive `ai-cr:passed` / `ai-cr:failed`.

## Phase 3: Composite action + workflow

### Changes Required

- `.github/actions/ai-reviewer/action.yml`
- `.github/workflows/ai-review.yml`
- `.github/workflows/ai-review-eval.yml` (path filter + `workflow_dispatch`)

### Success Criteria

- PR to `main` runs review with `fetch-depth: 0` and diff written to `$RUNNER_TEMP`.
- Existing `ci.yml` unchanged in job graph.

## Phase 4: promptfoo

### Changes Required

- `packages/code-reviewer/src/promptfoo-provider.ts`
- `packages/code-reviewer/promptfooconfig.yaml`
- `packages/code-reviewer/fixtures/idor-handler.diff`

### Success Criteria

- Fixture asserts `is-json` and `verdict === "fail"` with `securitySafety <= 3`.

## Phase 5: Champion evidence

### Changes Required

- `packages/code-reviewer/README.md` — secret, local smoke, screenshot checklist

### Success Criteria

- README lists `CURSOR_API_KEY` (Dashboard → Integrations; GitHub repo secret) and the three Champion screenshots.

## References

- Course M5L2 / M5L3 (SDK choice, GHA composite, promptfoo, HITL)
- Cursor TypeScript SDK: `Agent.create`, `local.customTools`, `RunResult.result`
- [`requirements.md`](./requirements.md)

## Progress

### Phase 0: 10x context

#### Automated

- [x] 0.1 change.md, requirements.md, and plan.md exist

### Phase 1: Local reviewer package

#### Automated

- [x] 1.1 Independent package with schema, CLI, and simulated fixture
- [x] 1.2 Root tsconfig/eslint exclude the package

### Phase 2: Tools + GitHub side effects

#### Automated

- [x] 2.1 read_plan and post_pr_comment tools
- [x] 2.2 Host labels and comment upsert

### Phase 3: Composite action + workflow

#### Automated

- [x] 3.1 Composite action and ai-review.yml on PRs to main
- [x] 3.2 Eval workflow is separate (paths or workflow_dispatch)

### Phase 4: promptfoo

#### Automated

- [x] 4.1 Custom provider, IDOR fixture, 2–3 Cursor models

### Phase 5: Champion evidence

#### Manual

- [x] 5.1 README documents CURSOR_API_KEY and screenshot checklist
- [ ] 5.2 Local smoke on simulated.diff when a Pro/team CURSOR_API_KEY is available (free-plan keys currently 403 on GET /v1/models)
