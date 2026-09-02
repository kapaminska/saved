# Meaningful unit and API test coverage — Plan Brief

> Full plan: `context/changes/test-coverage/plan.md`

## What & Why

Vitest already exists for 10xDevs “test presence,” but almost all money and check-in logic is untested. This change adds invariant tests for projections, validators, net worth, AI matching/parse, and the check-in/goals API handlers so regressions fail in CI without Docker or Playwright.

## Starting Point

One unit file (`projection.test.ts`), `npm test` in GitHub Actions, and manual RLS SQL under `supabase/tests/`. Handlers read `locals.user` and `locals.supabase`; `check-in/parse.ts` imports `cloudflare:workers` at the top of the file.

## Desired End State

`npm test` covers the critical money and AI-parse paths plus check-in/goals HTTP contracts (401/400/404/409/503). README explains JS tests vs manual RLS and names a future Playwright slice. No coverage percentage gate.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Test layers | Unit + API handlers with mocked Supabase | Highest signal without Docker in CI |
| Domain priority | Money + AI check-in | Wrong amounts or wrong goal match are the costliest bugs |
| Success | Named invariants, not coverage % | Matches S-10; avoids trivial tests for a number |
| Playwright | Out of scope + “next slice” note | OTP/E2E is a different harness |
| API style | Call `POST` with fake `locals` | Real status codes; no handler extract refactor |
| API surface | Check-in + goals lifecycle/payments only | Assets/profile/OTP deferred |
| RLS | Stay manual `psql` | Keep `npm test` Docker-free |
| React | No RTL | Logic lives in `src/lib` + APIs |

## Scope

**In scope:** Vitest setup mocks; colocated unit tests; handler tests for check-in, parse, goals CRUD-lifecycle and payments; README + `CLAUDE.md` `npm test`.

**Out of scope:** Playwright; React islands; assets/liabilities/profile/OTP APIs; RLS in CI; coverage gates; live Workers AI; product features.

## Architecture / Approach

Setup file mocks `astro:env/server` and `cloudflare:workers`. Tests inject `locals.supabase` (queued thenable query mock) and call exported `POST` functions with a small `APIContext` factory. `parseCheckInSentence` is unit-tested with a fake `Ai.run`. CI job unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest harness | Mocks + APIContext/Supabase helpers + smoke | `cloudflare:workers` / `astro:env` still throw on import |
| 2. Domain units | Money + AI lib invariants | Incomplete `computeGoalMetrics` / ambiguity matching |
| 3. API handlers | Check-in + goals/payments HTTP contracts | Mock queue order vs real `.from()` sequence |
| 4. Docs | README RLS + Playwright follow-up | Docs drift from what tests actually do |

**Prerequisites:** Existing Vitest (S-10). No new secrets.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- A too-coarse Supabase mock can pass tests while a real filter (`.eq("user_id")`) is missing — queue helpers should record filter calls for ownership-sensitive cases where cheap.
- `Date.now` in rate-limit tests must be frozen locally or tests flake.

## Success Criteria (Summary)

- CI `npm test` fails if listed money/AI/handler invariants regress
- Contributors run tests without Docker or Wrangler
- RLS and E2E are documented as outside this pyramid
