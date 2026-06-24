# Manual Check-in, Payments & Projections — Plan Brief

> Full plan: `context/changes/manual-checkin-payments-projections/plan.md`

## What & Why

Deliver roadmap slice S-03: manual monthly check-in as the AI fallback, payment history management, and projection/status display for every savings goal. This is the manual path that must work flawlessly before S-04 adds natural-language parsing — AI failure never blocks the user.

## Starting Point

S-02 delivered `savings_goals` with denormalized `saved_amount`, auto-complete trigger, dashboard progress bars, celebration modal (`?celebrated=`), and edit/archive pages. No payments table, no projection logic, no check-in UI, and no goal detail page exist. `saved_amount` is only updated via seed data today.

## Desired End State

Users check in from a dashboard modal — one month, all active goals, skip or explicit zero per goal. Payments persist with one row per goal per month; `saved_amount` stays synced via SUM. Dashboard cards show required pace, projected completion ("based on N months of data"), and on track / behind / ahead badges. `/goals/[id]` shows full payment history with inline edit and delete. Payment-triggered completion celebrates via existing modal.

## Key Decisions Made

| Decision                 | Choice                                    | Why (1 sentence)                                                                 | Source |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Status classification    | Projected date vs deadline (date compare) | PRD open question resolved: ahead/on track/behind from calendar date comparison. | Plan   |
| Check-in location        | Dashboard modal                           | Keeps monthly ritual on the main screen; no extra nav route.                     | Plan   |
| Payment history location | New `/goals/[id]` detail page             | S-02 scoped out history on edit page; detail is the natural home.                | Plan   |
| Zero months              | Explicit zero payment row                 | Visible in history (FR-020); same projection math as gaps.                       | Plan   |
| saved_amount sync        | SUM recalc after every mutation           | Single source of truth in payments; trigger handles completion.                  | Plan   |
| Projection window        | Goal lifetime (creation → now)            | Matches PRD; N = calendar months in window, gaps = 0.                            | Plan   |
| Payment uniqueness       | One row per goal per month                | DB UNIQUE constraint; edit moves row, not duplicates.                            | Plan   |
| Check-in scope           | Active goals only                         | Completed/abandoned goals excluded from modal.                                   | Plan   |
| Skip vs zero in modal    | Amount field + "0" shortcut; empty = skip | Skip creates no row; zero creates explicit 0 row.                                | Plan   |

## Scope

**In scope:**

- `goal_payments` migration (RLS, uniqueness, seed, RLS test)
- Projection library (pace, projected date, status)
- APIs: batch check-in, payment update, payment delete
- UI: dashboard modal, enhanced cards, goal detail + payment history
- FR-012, FR-015–FR-022

**Out of scope:**

- AI NL check-in (S-04)
- Dedicated `/check-in` page
- Payments on completed/abandoned goals
- Multiple payments per month per goal
- Charts, net worth panel, unit test framework

## Architecture / Approach

Payments are monthly atoms in `goal_payments` with UNIQUE `(goal_id, payment_month)`. All mutations upsert/delete then `recalcSavedAmount` via SUM — existing auto-complete trigger fires on `saved_amount` UPDATE. Projection math is pure functions in `src/lib/goals/projection.ts`, used in Astro SSR for dashboard/detail and invoked after API mutations. Check-in modal posts batch to `/api/check-in`; completion redirects reuse S-02 `CelebrationModal`.

## Phases at a Glance

| Phase               | What it delivers                         | Key risk                                             |
| ------------------- | ---------------------------------------- | ---------------------------------------------------- |
| 1. Schema & RLS     | Payments table, types, seed, RLS test    | Seed `saved_amount` must match payment SUM           |
| 2. Projection logic | Pace, projected date, status, validation | Zero-average edge case; date compare boundaries      |
| 3. Payment APIs     | Check-in batch, CRUD, SUM sync           | Transaction ordering for trigger + completion detect |
| 4. UI               | Modal, dashboard metrics, goal detail    | Modal UX for skip/zero; inline edit month collision  |

**Prerequisites:** S-02 complete ✓ (`savings_goals` + celebration)
**Estimated effort:** ~3–4 sessions across 4 phases

## Open Risks & Assumptions

- Zero average → no projected date; UI must handle gracefully (no misleading status)
- Completed goals stay completed even if payments deleted — S-02 sticky completion
- S-04 will reuse payment upsert + sync helpers; keep them generic
- Polish copy not finalized — match existing EN UI tone

## Success Criteria (Summary)

- User completes manual check-in for multiple active goals from dashboard
- Projections and status badges update immediately on dashboard and detail page
- Payment history supports inline edit, delete, and visible zero months
- Payment-triggered completion shows celebration; RLS isolates payment data per user
