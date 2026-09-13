## Overall concept

- GitHub Actions workflow on every pull request to `main`
- Composite action for the review itself so the main workflow stays easy to reason about
- Independent package `packages/code-reviewer` using Cursor SDK (local runtime)

## Input parameters

- pull request title
- pull request description (cost tradeoff: include it; skip only if empty)
- git diff versus the PR base branch (written to a file, not `GITHUB_OUTPUT`)

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

- **implementationCorrectness** — the change does what the PR claims; 1: silent regression; 10: happy path, edges, and errors.
- **idiomaticity** — Astro SSR islands, `@/` alias, `cn()`, no `"use client"`, no Node-only APIs on the edge; 1: starter conventions broken; 10: matches neighbouring files.
- **complexity** — simplest solution that fits; 1: extra abstraction; 10: change sized to the diff.
- **testRiskCoverage** — cheapest test with real signal per `context/foundation/test-plan.md`; 1: no test on money/auth/AI paths; 10: proportional coverage.
- **securitySafety** — `user_id` / ownership, no secrets, AI never persists payments; 1: IDOR / leak / parse write; 10: same boundaries as existing handlers.

Binding verdict: `pass` | `fail`. Fail when any criterion is ≤ 4 or a blocker finding is present (missing `user_id`, secret in the diff).

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary (`<!-- ai-cr -->`, upserted)
- labels: `ai-cr:failed` OR `ai-cr:passed`
- agent tools: `read_plan`, `post_pr_comment`
- host applies labels after parsing JSON (deterministic)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added
- job stays green when the agent returns valid JSON (even `verdict: fail`)
- human has the last word; agent never merges or approves
