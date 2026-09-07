# Isolation and abuse — Plan Brief

> Full plan: `context/changes/testing-isolation-and-abuse/plan.md`
> Research: `context/changes/testing-isolation-and-abuse/research.md`

## What & Why

Authenticated User B must not read or mutate User A’s goals, payments, assets, or liabilities (PRD isolation NFR / Risk #3). The app already 404s (SSR: redirects) when the session `user_id` filter misses; CI only proves 401 when logged out. This plan adds Vitest ownership tests so dropping `.eq("user_id", …)` fails in `npm test`.

## Starting Point

Handler tests exist for goals, payments, and check-in — all 401-when-logged-out plus queued-empty 404s that ignore `mock.calls`. `createSupabaseMock` does not apply filters. Assets/liabilities have no Vitest files. SQL RLS Alice/Bob scripts exist but are manual `psql`, not CI.

## Desired End State

Logged-in Bob + Alice’s ids is a named, failing-if-regressing case on each IDOR family: goal edit/abandon, payment edit, check-in foreign `goal_id`, one asset write, one liability write, plus SSR `getGoalDetailPageData` redirect, plus create stamps session `user_id`. Cookbook §6.3/§6.4 tell the next agent how to add the same proof. SQL RLS stays out of `npm test`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| CI isolation proof | Vitest API ownership via `mock.calls` | Mock cannot emulate RLS; call-list `eq("user_id", bobId)` is the only cheap HTTP proof | Research |
| SQL RLS in CI | Keep `supabase/tests/` manual | Docker/`psql`; contradicts prior slices; quiescence does not justify a new Actions job | Research / Plan |
| Assertion helper | `expectOwnershipEq` in `src/test/api-route.ts` | Same assert lands in 6+ files; zero matching calls must fail | Plan |
| SSR read | `getGoalDetailPageData` only | No money GET APIs; Playwright is out of stack; skip dashboard.astro | Research / Plan |
| Write breadth | Research minimum | One case per IDOR family, not every handler happy path | Research / Plan |
| Payment surface | Edit, not delete | Same double-check; edit file already exists | Plan |
| Net worth | Asset update + liability delete | First tests on untested files; both halves of net worth | Research / Plan |
| Create stamp | `POST /api/goals` only | Create is session-owner stamping, not foreign-UUID IDOR; assets/liabilities create deferred | Plan |
| 401 cases | Do not add on existing files | Already present; not the isolation proof. New net-worth files may include one 401 as the dual gate | Research / Plan |

## Scope

**In scope:** Harness helper; Bob-vs-Alice cases listed above; cookbook §6.3/§6.4/§6.6; §2 Risk #3 response-guidance alignment (no file anchors).

**Out of scope:** Product/schema changes; SQL in `npm test`; Playwright; remaining write handlers; `getEditGoalPageData` / dashboard; `ai_checkin_requests` RLS; `sync-saved-amount` hardening.

## Architecture / Approach

Same harness as Phase 1 (`createApiContext` + queue mock). Bob = `createTestUser({ id: OTHER_USER_ID })`; Alice’s UUIDs in params/form; queue empty; assert helper + 404/redirect + no mutate. App `.eq("user_id")` produces 404; RLS is the untested-in-CI backstop.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness + goal ownership | Helper, goal edit/abandon IDOR, create `user_id` | Helper too weak (soft find) or UUID collision with payment fixture |
| 2. Payments + check-in | Nested edit + foreign `goal_id` (schema hole) | Reusing Alice-hardcoded `editPayment`; queued-empty 404 without eq |
| 3. Net worth + SSR | First asset/liability tests; detail redirect | Happy-path CRUD instead of IDOR; Playwright temptation |
| 4. Cookbook | §6.3/§6.4/§6.6 + §2 guidance + §3 complete | File anchors leaking into §2 |

**Prerequisites:** Phase 1 rollout complete; research.md accepted; no Docker/Supabase required for these tests.
**Estimated effort:** ~1 session across 4 phases (test-only).

## Open Risks & Assumptions

- CI will not catch a migration that drops RLS; accepted for cost × signal (document in §6.3).
- `SUPABASE_KEY` as service_role would bypass RLS; residual config risk, not a test in this phase.
- `goal_payments.user_id` vs goal owner remains a schema gap; check-in test is the product control.

## Success Criteria (Summary)

- `npm test` fails if the session `user_id` filter is removed from a covered load, even when the mock still returns empty.
- Logged-in cross-user access is 404 / SSR redirect — never 200, never 401-as-proxy-for-IDOR.
- The next money endpoint can be tested from §6.3/§6.4 without re-reading research.
