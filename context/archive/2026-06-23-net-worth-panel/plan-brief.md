# Net Worth Panel — Plan Brief

> Full plan: `context/changes/net-worth-panel/plan.md`

## What & Why

Deliver roadmap slice S-07: a dashboard net worth panel where users track assets and liabilities, see honest net worth math, confirm assets are still current without re-entering amounts, and get a soft staleness nudge when data goes stale. Net worth is motivational context around the savings loop — not the core product — but it completes Secondary Success Criteria for the portfolio-ready MVP.

## Starting Point

F-01 through S-04 are done: auth, goals, payments, AI check-in, and a rich dashboard exist. No `assets` or `liabilities` tables, API routes, or UI. The savings-goals lifecycle provides the template for migrations + RLS, form-urlencoded POST APIs, validation helpers, and dashboard React islands. Profile already stores `relationship_status` for headline copy.

## Desired End State

Above Active goals, users see a net worth section: compact teaser when empty, full panel after the first asset or liability. They manage items via inline modals, see net worth (including negatives with a minus sign), confirm assets as still current per row or from a dismissable staleness banner, and get Polish possessive headlines (Twoja/Wasza) based on relationship status.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| CRUD UX | Dashboard inline modals | Keeps net worth as ambient context without new routes. | Plan |
| Empty state | Teaser card → full panel after first item | Balances discoverability with a clean goals-first dashboard. | Plan |
| Staleness dismiss | localStorage keyed to stalest asset id + lastUpdatedAt | Persists across sessions; re-shows when staleness identity changes. | Plan |
| Delete UX | Confirm before hard delete | Prevents accidental loss of named financial entries. | Plan |
| Confirm current (FR-026) | Per-row button + banner CTA | Usable anytime; banner is a shortcut for the stalest asset. | Plan |
| Asset sort order | Amount descending | Highlights what drives net worth. | Plan |
| Panel placement | Above Active goals | Matches PRD motivational-context positioning. | Plan |
| Relationship headline | married/partnership → Wasza, else Twoja | Implements FR-003 label intent from PRD. | Plan |
| Negative net worth | Same styling, show minus | Honest math per PRD guardrail — no sugarcoating. | Plan |
| Staleness scope | Oldest asset by last_updated_at; liabilities ignored | Matches FR-027 one-banner-by-oldest-asset spec. | PRD |
| Dedicated routes | None — dashboard only | Scope cut; modals sufficient for MVP panel. | Plan |

## Scope

**In scope:**
- `assets` + `liabilities` migration (RLS with DELETE, seed, RLS tests, regen types)
- API: asset CRUD + confirm-current; liability CRUD
- Dashboard: teaser, full panel, modals, staleness banner, SSR integration
- FR-023–FR-027, FR-003 headline copy

**Out of scope:**
- Net worth history, liability categories, custom asset categories, multi-currency
- Dedicated `/net-worth` pages, server-side banner dismiss, payment-to-asset linking
- Middleware changes, unit test framework

## Architecture / Approach

Database-first: two user-scoped tables with full CRUD RLS. Assets carry `last_updated_at` for confirm-current and staleness. API routes follow the established POST + form-urlencoded + JSON `{ success, error }` contract with validation in `src/lib/net-worth/`. Dashboard SSR loads both tables, computes net worth and stalest asset server-side, and hydrates a single `NetWorthPanel` React island with inline modals. Staleness banner dismiss is client-only localStorage.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & RLS | Tables, seed, RLS tests, types | `last_updated_at` semantics must stay separate from generic `updated_at` |
| 2. Net Worth API | Validation, CRUD, confirm endpoint | Confirm route must not accept amount changes |
| 3. Dashboard Panel UI | Teaser, modals, banner, SSR wiring | Teaser→full transition must reload SSR data after first save |

**Prerequisites:** F-01 complete ✓
**Estimated effort:** ~3 sessions across 3 phases

## Open Risks & Assumptions

- Dashboard UI copy is mostly English today; net worth headline uses Polish possessives per PRD — intentional mixed locale until S-06 visual-language polish
- 3-month staleness uses calendar-month logic — implement once in `compute.ts` and document to avoid SSR/client drift
- Staleness dismiss is per-browser (localStorage) — acceptable for MVP soft prompt
- Seed stale asset required for manual FR-027 testing without waiting 3 real months

## Success Criteria (Summary)

- User can CRUD assets (with categories) and liabilities; net worth displays honestly including negatives
- Confirm current refreshes timestamp without changing amount; staleness banner appears, dismisses, and clears on confirm
- Twoja/Wasza headline reflects relationship status; panel sits above goals with teaser empty state
