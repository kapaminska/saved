# Savings Goals Lifecycle — Plan Brief

> Full plan: `context/changes/savings-goals-lifecycle/plan.md`

## What & Why

Deliver roadmap slice S-02: the full savings goal lifecycle — create, edit, abandon, auto-complete at 100%, celebrate achievements, and browse past goals in an archive. This is the data and UI foundation that S-03 (manual payments) and S-04 (AI check-in) build on. Without goals, the product's core loop cannot exist.

## Starting Point

F-01 delivered `profiles` with RLS and reusable DB utilities. S-01 delivered auth, onboarding, and profile editing. The dashboard is still a placeholder with no goal data. No `savings_goals` table, API routes, or goal components exist. The profile API + `ProfileForm` pattern is the established convention for new features.

## Desired End State

Users create goals from `/goals/new`, manage active goals from the dashboard (progress bars capped at 100%), edit or abandon from `/goals/[id]/edit`, and see completed/abandoned goals in `/goals/archive`. When progress hits target, a DB trigger completes the goal and the user sees confetti + a warm celebration modal. S-03 can update `saved_amount` and inherit auto-complete without new lifecycle logic.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Progress storage | `saved_amount` column on goals | Enables dashboard reads and auto-complete without payments table; S-03 keeps it in sync. | Plan |
| Auto-complete in S-02 | DB trigger + full celebration UI | Delivers complete S-02 outcome; S-03 inherits trigger on payment updates. | Plan |
| Overpayment | Complete at ≥100%, cap display at 100% | Matches FR-009 literally; avoids goals stuck active forever. | Plan |
| Name length limit | 100 characters | Enough for descriptive names; matches schema CHECK and form maxLength. | Plan |
| Create/edit UX | `/goals/new` and `/goals/[id]/edit` | Matches ProfileForm dedicated-route pattern; clean URLs and middleware. | Plan |
| Archive UX | Separate `/goals/archive` page | Keeps dashboard focused on active goals; clear FR-030 archive section. | Plan |
| Celebration | `canvas-confetti` + modal via `?celebrated=` param | Lightweight brand moment; fires once per event, reusable from S-03 redirect. | Plan |
| Edit warning | Inline amber callout on target/deadline change | Satisfies FR-006 without blocking browser confirm dialogs. | Plan |

## Scope

**In scope:**
- `savings_goals` migration (RLS, auto-complete trigger, seed, RLS test)
- API: create, edit (active only), abandon
- UI: GoalForm, dashboard list, create/edit pages, archive, celebration modal
- Middleware protection for `/goals/*`, Topbar archive link
- FR-005–007, FR-009–010, FR-030

**Out of scope:**
- Payments, check-in, projections, status badges (S-03)
- AI parsing (S-04)
- Restore goals (FR-008 dropped), hard delete
- Goal detail charts, net worth panel
- Unit test framework

## Architecture / Approach

Database-first: `savings_goals` table with denormalized `saved_amount` and a `BEFORE INSERT OR UPDATE` trigger for auto-complete. API routes follow the profile pattern (form-urlencoded POST, JSON `{ success, error }`, server validation in `src/lib/goals/validation.ts`). UI uses shared `GoalForm` React island on dedicated Astro pages; dashboard SSR-loads active goals; celebration is client-side triggered by query param for one-shot UX.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & RLS | Table, trigger, types, seed, RLS test | Trigger must fire on target lowering, not just saved_amount increases |
| 2. Goal API | Create, edit, abandon endpoints | Edit-after-complete race if response doesn't re-read post-trigger row |
| 3. Goals UI | Forms, dashboard, archive, confetti | Celebration must not replay on refresh — query param cleanup |

**Prerequisites:** F-01 complete ✓ (profiles + RLS pattern)
**Estimated effort:** ~3 sessions across 3 phases

## Open Risks & Assumptions

- S-02 celebration manual testing requires updating `saved_amount` via Studio/seed until S-03 ships payment UI
- S-03 must document contract: payment saves update `saved_amount` and redirect with `?celebrated=` on completion
- Polish UI copy (PL vs EN) not finalized — implement in consistent tone with existing auth/profile pages

## Success Criteria (Summary)

- User can create, edit, and abandon goals; abandoned/completed data preserved
- Goal auto-completes at 100% with celebration moment (confetti + message)
- Archive shows completed vs abandoned goals with visual separation
- RLS ensures strict per-user data isolation
