# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-03

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase`.

Existing Vitest suite (goals, net-worth, API handlers) is the floor, not
the ceiling. New tests must catch a named failure from §2. Last-30-day
churn was mostly new test files — do not treat that as proof the money
path is unstable; Q1 and the PRD still put assignment and integrity first.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A saved check-in credits the wrong goal; the dashboard still looks plausible | High | High | interview Q1; PRD US-01 / FR-013; hot-spot dir `src/lib/goals` (11 commits/30d), `src/pages/api` (12/30d) |
| 2 | A payment is duplicated, dropped, or booked to the wrong month | High | High | interview Q1; PRD data-integrity guardrail; FR-016, FR-021; archive S-03 |
| 3 | Authenticated user A can read or mutate user B’s goals, payments, or net worth | High | Medium | interview Q1; PRD Privacy / NFR isolation; abuse lens (IDOR); archive F-01 / S-02 / S-03 RLS; `supabase/` 0 commits/30d |
| 4 | AI is unavailable, invalid, or rate-limited and the user cannot record the month | High | Medium | PRD AI-never-blocks guardrail; US-01 AC; archive S-04 |
| 5 | An out-of-contract AI proposal is persisted as a payment | High | Medium | PRD NFR; FR-035 / FR-036; archive S-04 |
| 6 | AI parse (or OTP send) can be triggered in a loop, burning quota without a fallback signal | Medium | Medium | PRD FR-034; abuse lens (resource abuse); archive S-04, S-01 |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | After save, each amount lands on the goal the user confirmed on review — not the name the model guessed | Happy-path parse implies correct assignment | Review → persist contract; how unmatched names are excluded | integration (handler + domain) | Asserting the parser’s own mapping against itself |
| #2 | Same month cannot produce two rows; a missing month is 0, not deleted history; future months rejected | Empty list means no corruption | Uniqueness rule; backdate vs future; delete vs zero | unit + integration | Happy-path-only single insert |
| #3 | User B gets empty/404 on user A’s ids — read and write — for goals, payments, assets | Being logged in is enough | Auth vs ownership; RLS vs app-layer; whether SQL RLS runs in CI | integration (API ownership) and/or SQL RLS in the JS/CI loop | Testing only 401 when logged out |
| #4 | AI error / timeout / 503 still offers a working manual path; nothing is written | A 200 from parse means the month was recorded | Error codes the UI keys off; manual path independence | integration on parse failure + fallback payload contract | E2e of the modal because it feels safer |
| #5 | Negative / unmatched / malformed AI payload never becomes a payment row | Showing proposals means they are safe to save | Structural vs domain validation; save uses review payload, not raw model output | unit (schema/domain) + integration (save ignores invalid) | Snapshot of current validator output as the oracle |
| #6 | 11th parse in the window is denied with a fallback signal; brute OTP does not multiply side effects unchecked | A rate-limit table means the limit fires | Window, per-user key, client-facing response | integration against the limit boundary | Mocking the limiter to always allow |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path coverage | Prove assignment and payment integrity cannot silently corrupt the month | #1, #2 | unit + integration | complete | testing-critical-path-coverage |
| 2 | Isolation and abuse | Prove ownership, not merely “is logged in” | #3 | integration (+ RLS in CI if research confirms it is the proof) | not started | — |
| 3 | AI safety path | Prove AI failure degrades, never blocks or writes garbage | #4, #5, #6 | unit + integration | not started | — |
| 4 | Quality-gates wiring | Lock the Vitest floor; add the isolation proof Phase 2 chose | cross-cutting | gates | not started | — |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

Test-base profile: **meaningful** — Vitest configured, 19 `*.test.ts` files
across goals, net-worth, and API handlers. UI islands, OTP, and SQL RLS
(`supabase/tests/`) sit outside `npm test`.

| Layer | Tool | Version | Notes |
|----------------------|----------------------------|---------|--------------------------------------|
| unit + integration | Vitest | ^4.1.11 | `src/**/*.test.ts`; `npm test` = `vitest run`; existing handler harness (no MSW) |
| API mocking | existing Vitest harness | n/a | Research must verify edge vs over-mock; do not add MSW unless cheaper signal needs it |
| e2e | none | — | Not in this rollout. Do not add Playwright because it feels safer |
| SQL RLS | supabase/tests scripts | n/a | Five isolation scripts; not in `npm test` today. Phase 2 decides CI wiring |
| (optional) AI-native | Cursor browser MCP — checked: 2026-09-03 | n/a | Manual smoke only. Do not use for assignment, uniqueness, or IDOR |

**Stack grounding tools (current session):**
- Docs: Context7 — Vitest 4 path aliases / `vitest run`; Astro 6 testing (Vitest `node` env, Container API for endpoints); checked: 2026-09-03
- Search: Exa.ai not available in current session — skipped; checked: 2026-09-03
- Runtime/browser: Cursor browser MCP — possible smoke, not a default layer; checked: 2026-09-03
- Provider/platform: Supabase MCP `needsAuth` (not used); GitHub Actions already runs `npm test`; checked: 2026-09-03

Astro 6 docs: do not render Astro components in a Vitest client environment.
Handler tests should stay on the cheapest harness already in the repo unless
research shows it cannot catch §2 failures.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|-------------------------------|-------------------|------------------------------|-----------------------------------------------|
| lint + typecheck | local + CI | required (already wired) | syntactic / type drift |
| unit + integration (`npm test`) | local + CI | required (already wired); Phases 1–3 add cases | assignment, uniqueness, AI contract, fallback |
| isolation proof (API ownership and/or SQL RLS in CI) | local + CI | required after §3 Phase 2; locked in Phase 4 | IDOR / cross-user leak |
| pre-prod smoke | between merge + prod | optional | environment-only auth/AI binding failures |

No e2e, visual-diff, or post-edit-hook gate: no rollout phase owns them.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: colocated `*.test.ts` next to the unit (`src/lib/goals/payment-validation.test.ts`).
- **Run locally**: `npm test`.
- **Payment month / amount (Risk #2)**: use the unit file for `validateCheckInMonth` and `parsePaymentAmount` in isolation. Use the handler tests (`src/pages/api/check-in.test.ts`, `src/pages/api/goals/[id]/payments/[paymentId].test.ts`) when the regression is "the API booked it anyway" — a green unit test of `validateCheckInMonth` is not enough.
- **Pin dates**: inject `today` in unit tests; at the handler, use a far-future month (`2099-12`) so the case does not depend on wall-clock, and a clearly past month (`2020-01`) for accepted saves.
- **Oracle**: PRD FR-015 (explicit zero vs skip — both project as 0; only explicit zero is a history row) and FR-020 (zero months appear in history). FR-016 / FR-021: future months rejected on check-in and on edit. Do not treat current function output as the spec.
- **Duplicate month**: uniqueness is `UNIQUE (goal_id, payment_month)` plus upsert `onConflict: "goal_id,payment_month"`. Prove it at the handler by two successful POSTs and `mock.calls` — not a single-insert happy path.
- **Zero vs skip**: `amount: "0"` must upsert `amount: 0`; empty/whitespace amount must produce no upsert for that goal. Skip is not a deleted history row; delete is a different path (out of this recipe).
- **Reference tests**: `src/lib/goals/payment-validation.test.ts`; future/zero/skip/upsert cases in `src/pages/api/check-in.test.ts`; future-month edit in `src/pages/api/goals/[id]/payments/[paymentId].test.ts`.

### 6.2 Adding an integration test

- **Location**: colocated next to the handler (`src/pages/api/check-in.test.ts`).
- **Harness**: `createApiContext` + queue-based `createSupabaseMock` from `src/test/api-route.ts`. Inspect `mock.calls` for side effects. Do not add MSW or jsdom for this risk.
- **Review-then-save assignment (Risk #1)**: `POST /api/check-in` with explicit `goal_id` + `amount` arrays. Assert each upsert payload's `goal_id` and `amount` match the form. Save is UUID-authoritative; do not involve parse in the same test.
- **Minimum bar**: a multi-goal batch (two distinct `goal_id`s). Single-goal happy path does not prove assignment.
- **Anti-pattern**: asserting parse/`matchGoalName` output against itself. Adversarial name cases belong in `src/lib/goals/ai-checkin/goal-name-match.test.ts` and document the match rules (exact → unique substring → unique fuzzy), not "whatever the implementation returned."
- **Reference tests**: multi-goal and submitted-`goal_id` cases in `src/pages/api/check-in.test.ts`; adversarial similar-name cases in `src/lib/goals/ai-checkin/goal-name-match.test.ts`.

### 6.3 Adding an ownership / isolation test

TBD — see §3 Phase 2 for logged-in-but-not-owner denial/regression pattern.

### 6.4 Adding a test for a new API endpoint

TBD — see §3 Phase 2 for ownership on write, not only 401 when logged out.

### 6.5 Adding a test for AI failure or invalid payload

TBD — see §3 Phase 3 for fallback-without-write and out-of-contract payload pattern.

### 6.6 Per-rollout-phase notes

- **§3 Phase 1 (`testing-critical-path-coverage`)**: Risk #2 handler cases in `src/pages/api/check-in.test.ts` (future month, explicit zero, skip, upsert overwrite) and `src/pages/api/goals/[id]/payments/[paymentId].test.ts` (future month on edit). Risk #1 save fidelity in `check-in.test.ts` (multi-goal `goal_id` + UUID contract) plus adversarial `matchGoalName` cases in `src/lib/goals/ai-checkin/goal-name-match.test.ts`. Save and parse stay decoupled tests.

## 7. What We Deliberately Don't Test

Interview Q5 was not asked (Q2–Q4 skipped; interview aborted). Defaults
from documents until `/10x-test-plan --refresh` captures an explicit Q5:

- **Playwright / full OTP login e2e** — archived S-10 scoped this out; CI already has Vitest. Re-evaluate if a production-only auth bug lands. (Source: archive S-10; no interview Q5.)
- **Landing / visual-language snapshots** — cosmetic; S-05/S-06 were visual polish. Re-evaluate if brand lockup regresses in a way users cannot ignore. (Source: PRD NFR browsers-only; archive S-05 testing strategy.)
- **Generated database types** — generator is the check. Re-evaluate if types are hand-edited. (Source: archive F-01.)
- **Confetti / celebration visuals** — brand moment, not a data-integrity failure. Re-evaluate if completion state itself is wrong (that belongs to Phase 1 if research ties it to saved totals). (Source: PRD FR-010 vs data-integrity guardrail.)
- **Net worth as a primary product loop** — secondary success criterion; isolation of net worth is still in Risk #3. Do not spend Phase 1 budget on asset CRUD happy paths. (Source: PRD Secondary vs interview Q1.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-03
- Stack versions last verified: 2026-09-03
- AI-native tool references last verified: 2026-09-03

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
