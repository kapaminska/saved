# Manual Check-in, Payments & Projections Implementation Plan

## Overview

Implement roadmap slice S-03: manual monthly check-in (multi-goal fallback before AI), payment history with inline edit/delete, and projection/status display per goal. Covers PRD FR-012, FR-015–FR-022. Builds on S-02 (`savings_goals` table, dashboard, celebration modal, auto-complete trigger).

## Current State Analysis

S-02 is implemented — `savings_goals` with RLS, auto-complete trigger, CRUD API, dashboard with progress bars, edit/archive pages, and `CelebrationModal` via `?celebrated=<id>`. The denormalized `saved_amount` column exists but is only set via seed/manual Studio updates. No `goal_payments` table, no payment API, no projection logic, no status badges, no check-in UI, and no goal detail page (S-02 explicitly scoped out payment history).

### Key Discoveries:

- S-03 contract from S-02 plan: payment saves must UPDATE `saved_amount` and redirect to `/dashboard?celebrated=<id>` when completion fires (`context/changes/savings-goals-lifecycle/plan.md:341`)
- Auto-complete trigger fires on `saved_amount` UPDATE — SUM recalc approach fits without new trigger logic (`supabase/migrations/20260623120000_create_savings_goals.sql:47-49`)
- API pattern: form-urlencoded POST, JSON `{ success, error }`, validation in `src/lib/goals/validation.ts` (`src/pages/api/goals/index.ts`)
- Dashboard SSR loads active goals only (`src/pages/dashboard.astro:24-29`) — natural host for check-in modal
- PRD status thresholds are undefined — user chose projected completion date vs deadline (date compare)
- PRD projection uses goal-lifetime month window with gaps as 0 (`context/foundation/prd.md:172-174`)

## Desired End State

An authenticated user opens a check-in modal from the dashboard, selects a month (default: current; past allowed; future blocked), enters amounts per active goal (empty = skip, "0" shortcut = explicit zero row), and saves. Payments upsert one row per goal per month; `saved_amount` recalculates as SUM(payments). If a payment triggers completion, the user is redirected to `/dashboard?celebrated=<id>`.

Each active goal on the dashboard shows required pace (if deadline), projected completion date with "based on N months of data" label, and status badge (on track / behind / ahead) via date comparison. Open-ended goals show no pace/status classification.

A new `/goals/[id]` detail page shows payment history (including zero months), inline edit of amount/month, and permanent delete. Editing or deleting payments recalculates projections and `saved_amount` immediately.

**Verification:** Check-in for 2 active goals → dashboard updates → goal detail shows history → edit payment → projection changes → delete payment → zero-month explicit row visible → backdated month works → future month rejected → completion via payment shows celebration → second user cannot see payments (RLS).

## What We're NOT Doing

- AI natural-language check-in parsing — S-04
- Net worth panel — parked in roadmap
- Charts or trend visualizations — PRD non-goal
- Payments on completed or abandoned goals
- Multiple payment rows per goal per month
- Dedicated `/check-in` page (check-in lives in dashboard modal per user decision)
- Unit/integration test framework — manual verification for MVP
- Polish localization pass — match existing EN tone in auth/profile/goals UI

## Implementation Approach

Four phases in dependency order: (1) `goal_payments` schema with one-per-month uniqueness and RLS, (2) pure projection/validation library implementing PRD business logic, (3) API routes for batch check-in and payment CRUD with SUM-based `saved_amount` sync, (4) UI — dashboard modal, enhanced goal cards, goal detail page with history.

Projection math lives in `src/lib/goals/projection.ts` (server-safe, reusable in Astro SSR and API). Status classification: `ahead` if projected date < deadline, `on track` if projected date = deadline, `behind` if projected date > deadline. Goals without deadline or without computable projection (e.g. zero average) show no status badge.

## Critical Implementation Details

### State sequencing

Always recalculate `saved_amount` from SUM after any payment INSERT/UPDATE/DELETE before returning API response — the auto-complete trigger must see the final total on the same transaction's UPDATE to `savings_goals`. Batch check-in should recalc all touched goals and re-read status to detect newly completed goals for redirect.

### User experience spec

Check-in modal: one amount field per active goal plus a per-goal "0" control that sets the field to zero (explicit zero row on save). Empty field = skip (no payment row for that goal this month). Month picker defaults to current calendar month.

Goal detail inline edit must validate month uniqueness — moving a payment to a month that already has a row for the same goal should return a clear error.

---

## Phase 1: Schema & RLS

### Overview

Create `goal_payments` table with per-goal per-month uniqueness, RLS mirroring goals pattern, TypeScript types, seed payments for dev, and RLS verification script.

### Changes Required:

#### 1. Goal payments migration

**File**: `supabase/migrations/20260623140000_create_goal_payments.sql` (new)

**Intent**: Store monthly payment atoms. One row per goal per calendar month. Amount ≥ 0 (zero allowed). Denormalized `user_id` for straightforward RLS.

**Contract**:

Table `public.goal_payments`:

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| goal_id | UUID | NOT NULL, FK → savings_goals(id) ON DELETE CASCADE |
| user_id | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| amount | NUMERIC(12,2) | NOT NULL, CHECK (amount >= 0) |
| payment_month | DATE | NOT NULL — always first day of month (e.g. `2026-06-01`) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

Constraints: `UNIQUE (goal_id, payment_month)`. Index on `(user_id, payment_month)` and `(goal_id, payment_month)`.

RLS: enable; policies `select_own`, `insert_own`, `update_own`, `delete_own` using `auth.uid() = user_id`. `set_updated_at` trigger.

#### 2. TypeScript database types

**File**: `src/types/database.ts`

**Intent**: Add `goal_payments` Row/Insert/Update types matching migration.

**Contract**: New `goal_payments` entry under `Tables` with columns above; `Relationships` referencing goals.

#### 3. Seed payments

**File**: `supabase/seed.sql`

**Intent**: Add sample payment history for the active seed goal ("Fundusz awaryjny") spanning 3 months including one explicit zero month — enables projection manual testing without UI.

**Contract**: Insert rows only for active seed goal; totals should align with `saved_amount` (2500) or update seed `saved_amount` after payments inserted.

#### 4. RLS verification script

**File**: `supabase/tests/rls-goal-payments.sql` (new)

**Intent**: Mirror `rls-savings-goals.sql` pattern — Alice cannot read/write Bob's payments.

**Contract**: Assert SELECT/INSERT/UPDATE/DELETE isolation for two test users.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- RLS script passes: `supabase/tests/rls-goal-payments.sql`
- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Studio shows `goal_payments` table with uniqueness constraint
- Seed payments visible for test user on active goal
- Duplicate `(goal_id, payment_month)` insert rejected

**Implementation Note**: Pause for manual confirmation before Phase 2.

---

## Phase 2: Projection Logic & Payment Validation

### Overview

Implement PRD projection math and payment parsing helpers in `src/lib/goals/`. No UI yet — pure functions testable via manual invocation or future tests.

### Changes Required:

#### 1. Payment validation helpers

**File**: `src/lib/goals/payment-validation.ts` (new)

**Intent**: Parse and validate payment amount (≥ 0, max 2 decimals), payment month (YYYY-MM-DD first-of-month or YYYY-MM input normalized to first of month), and check-in month rules (past and current allowed, future blocked).

**Contract**:

- `parsePaymentAmount(value)` — accepts `0`; rejects negative and invalid format (reuse regex style from `parseTargetAmount`)
- `parsePaymentMonth(value)` — returns first day of month as `YYYY-MM-DD`
- `validateCheckInMonth(month, today)` — rejects future months

#### 2. Projection engine

**File**: `src/lib/goals/projection.ts` (new)

**Intent**: Implement PRD business logic §2–4 for required pace, projected completion, and status classification.

**Contract**:

Input: goal row (`target_amount`, `saved_amount`, `deadline`, `created_at`, `status`) + payment rows (`amount`, `payment_month`).

Functions:

- `countGoalLifetimeMonths(createdAt, asOfDate)` — calendar months from creation month through `asOfDate` month inclusive (= N for label)
- `averageMonthlyPayment(createdAt, asOfDate, payments)` — sum amounts for each month in window; months without a row = 0
- `requiredPace(target, saved, deadline, asOfDate)` — `(target − saved) / monthsRemaining`; `null` if no deadline or deadline passed
- `projectedCompletionDate(saved, target, average, asOfDate)` — extrapolate months needed from average; `null` if average ≤ 0 or already complete
- `goalStatus(projectedDate, deadline)` — `null` if no deadline or no projected date; else `ahead` | `on_track` | `behind` via date compare (`<`, `===`, `>` on calendar dates)
- `computeGoalMetrics(goal, payments, asOfDate)` — bundles pace, projected date, status, `monthsOfData` (N), average

Open-ended goals: pace and status return `null`; dashboard shows progress only.

#### 3. Saved amount sync helper

**File**: `src/lib/goals/sync-saved-amount.ts` (new)

**Intent**: Single function used by all payment mutation APIs to keep denormalized column accurate.

**Contract**: `recalcSavedAmount(supabase, goalId)` — `UPDATE savings_goals SET saved_amount = COALESCE(SUM(amount), 0) FROM goal_payments WHERE goal_id = $1`; returns updated row including post-trigger `status`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Spot-check `computeGoalMetrics` with seed data: N months label matches goal lifetime
- Zero average → no projected date; deadline goal with positive average → status classifies correctly
- Explicit zero month lowers average same as skipped month (no row) for that month in window

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Payment API Routes

### Overview

Batch check-in endpoint and per-payment CRUD. All mutations recalc `saved_amount` and return completion signal for celebration redirect.

### Changes Required:

#### 1. Batch check-in API

**File**: `src/pages/api/check-in.ts` (new)

**Intent**: Accept one check-in month plus per-goal amounts for all active goals. Upsert payments for goals with amount provided (including 0); skip goals with empty amount. Recalc `saved_amount` for each upserted goal.

**Contract**: `POST`, form-urlencoded. Fields: `payment_month`, repeated `goal_id` + `amount` pairs (only goals with submitted amount). Auth required. Only `active` goals owned by user. Upsert on `(goal_id, payment_month)`. Response: `{ success, completedGoals: [{ id, name }] }` for goals that transitioned to `completed` during this request.

#### 2. Update payment API

**File**: `src/pages/api/goals/[id]/payments/[paymentId].ts` (new)

**Intent**: Inline-edit amount and month (FR-021). Validate uniqueness when month changes.

**Contract**: `POST` with `amount`, `payment_month`. Verify payment belongs to goal and user. On success recalc `saved_amount`; include `completed: true` if goal just completed.

#### 3. Delete payment API

**File**: `src/pages/api/goals/[id]/payments/[paymentId]/delete.ts` (new)

**Intent**: Permanent delete (FR-022). Recalc `saved_amount` after delete. Note: deleting payments on a completed goal does not revert status (completion is sticky per S-02 — document in API error if attempting mutation on non-active goal).

**Contract**: `POST` (matches abandon pattern). Reject if goal not `active`.

#### 4. Middleware route protection

**File**: `src/middleware.ts`

**Intent**: Ensure `/api/check-in` and payment routes require auth (inherits from existing pattern if all `/api/*` paths check user — verify and add if needed).

**Contract**: Unauthenticated requests return 401.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Batch check-in creates/updates payments; skipped goals unchanged
- Explicit zero creates row with amount 0
- Future month rejected with visible error
- Duplicate month on edit rejected
- Payment pushing `saved_amount` ≥ target completes goal; API reports `completedGoals`
- Delete reduces `saved_amount` correctly
- RLS: second user cannot mutate first user's payments

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Check-in Modal, Dashboard Metrics & Goal Detail

### Overview

Dashboard check-in modal, projection/status on goal cards, new goal detail page with payment history and inline edit/delete.

### Changes Required:

#### 1. Check-in modal component

**File**: `src/components/goals/CheckInModal.tsx` (new)

**Intent**: Dashboard modal (FR-012). Month picker + amount field per active goal + per-goal "0" shortcut. Submit to `/api/check-in`. On success: if any `completedGoals`, redirect to `/dashboard?celebrated=<firstId>`; else refresh dashboard state (navigation reload acceptable for MVP).

**Contract**: Props: `goals` (active list), `defaultMonth` (current). Loading/disabled on submit. Display API errors inline.

#### 2. Dashboard integration

**File**: `src/pages/dashboard.astro`

**Intent**: Add "Check in" button opening modal. Load payments for active goals (batch query or per-goal). Compute metrics via `computeGoalMetrics` for each card. Link goal name to `/goals/[id]` instead of only edit link.

**Contract**: Each card shows: progress bar (existing), required pace (if deadline), projected date + "based on N months of data", status badge (if classified). `CheckInModal` island with `client:load`.

#### 3. Status badge component

**File**: `src/components/goals/GoalStatusBadge.tsx` (new)

**Intent**: Visual on track / behind / ahead with soft tone (PRD: honest math, softened presentation).

**Contract**: Props: `status: 'ahead' | 'on_track' | 'behind' | null`. Color-coded pill matching cosmic theme.

#### 4. Goal detail page

**File**: `src/pages/goals/[id]/index.astro` (new)

**Intent**: Goal detail with projections summary and payment history (FR-020). Read-only goal header (name, progress, pace, projection, status). Links to edit page.

**Contract**: SSR loads goal + payments; 404/redirect if not found or not owned. Only `active` goals show editable history; completed/abandoned may show read-only history (optional — at minimum redirect active-only edit actions).

#### 5. Payment history component

**File**: `src/components/goals/PaymentHistory.tsx` (new)

**Intent**: List payments sorted by month descending. Inline edit amount/month (FR-021). Delete button with confirm (FR-022). Zero months visible.

**Contract**: React island; calls payment update/delete APIs; reload or optimistic update on success.

#### 6. Detail page data helper

**File**: `src/lib/goals/detail-page.ts` (new)

**Intent**: Shared loader for goal detail SSR (mirrors `edit-page.ts` pattern).

**Contract**: `getGoalDetailPageData(headers, cookies, userId, goalId)` — returns goal, payments, metrics, or redirect/error kind.

#### 7. Topbar / navigation

**File**: `src/components/Topbar.astro` (optional tweak)

**Intent**: No separate check-in nav item — check-in is dashboard-only per user decision. Verify no stale links needed.

**Contract**: Dashboard remains primary entry point.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Full check-in flow from dashboard modal for multiple goals
- Skip vs zero vs positive amount behave correctly
- Dashboard cards show pace, projection label, status after check-in
- Goal detail history shows zeros; inline edit and delete work
- Backdated check-in updates projections
- Payment completion triggers celebration modal
- Active goals only in check-in modal
- Goal detail accessible from dashboard card link

**Implementation Note**: Final manual sign-off for S-03 slice complete.

---

## Testing Strategy

### Unit Tests:

- Not in MVP scope — projection functions are prime candidates when test framework lands

### Integration Tests:

- RLS scripts for goals and payments (`supabase/tests/`)

### Manual Testing Steps:

1. Create 2 active goals with deadlines → open check-in modal → enter amounts for one, zero for another, skip third if exists → save
2. Verify dashboard metrics update (pace, projection, status)
3. Open goal detail → confirm history rows → edit amount → projection updates
4. Delete a payment → saved_amount and projection update
5. Backdate check-in to prior month → verify average and N label change
6. Attempt future month → blocked with error
7. Enter payment completing goal → celebration redirect
8. Confirm completed goal absent from check-in modal
9. RLS with second test user

## Performance Considerations

- Dashboard loads active goals + one payments query (filter by goal_ids IN (...)) — acceptable at MVP scale
- Projection computed server-side in SSR — no client bundle bloat
- Batch check-in single transaction per goal upsert acceptable for small goal counts

## Migration Notes

- Forward-only migration on top of S-02 `savings_goals`
- After seed payments inserted, run SUM sync or set `saved_amount` in seed to match payment totals
- S-04 AI check-in will reuse payment upsert + sync helpers — keep API internal functions reusable

## References

- S-02 plan: `context/changes/savings-goals-lifecycle/plan.md`
- PRD: `context/foundation/prd.md` (FR-012, FR-015–FR-022, Business Logic §2–4)
- Roadmap: `context/foundation/roadmap.md` (S-03)
- Goals migration: `supabase/migrations/20260623120000_create_savings_goals.sql`
- Dashboard: `src/pages/dashboard.astro`
- Celebration modal: `src/components/goals/CelebrationModal.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & RLS

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — c9896bf
- [x] 1.2 RLS script passes: `supabase/tests/rls-goal-payments.sql` — c9896bf
- [x] 1.3 Build passes: `npm run build` — c9896bf
- [x] 1.4 Lint passes: `npm run lint` — c9896bf
- [x] 1.5 Type checking passes: `npx astro sync && npx tsc --noEmit` — c9896bf

#### Manual

- [x] 1.6 Studio shows table, uniqueness constraint, and seed payments — c9896bf
- [x] 1.7 Duplicate goal+month insert rejected — c9896bf

### Phase 2: Projection Logic & Payment Validation

#### Automated

- [x] 2.1 Build passes: `npm run build` — 7090457
- [x] 2.2 Lint passes: `npm run lint` — 7090457
- [x] 2.3 Type checking passes: `npx astro sync && npx tsc --noEmit` — 7090457

#### Manual

- [x] 2.4 Spot-check metrics with seed data (N label, status classification) — 7090457
- [x] 2.5 Zero average and explicit zero month behave per PRD — 7090457

### Phase 3: Payment API Routes

#### Automated

- [x] 3.1 Build passes: `npm run build` — edbbc48
- [x] 3.2 Lint passes: `npm run lint` — edbbc48
- [x] 3.3 Type checking passes: `npx astro sync && npx tsc --noEmit` — edbbc48

#### Manual

- [x] 3.4 Batch check-in upsert, skip, and zero paths work — edbbc48
- [x] 3.5 Future month and duplicate-month edit rejected — edbbc48
- [x] 3.6 Completion detected and returned in API response — edbbc48
- [x] 3.7 RLS isolation verified for payments — edbbc48

### Phase 4: Check-in Modal, Dashboard Metrics & Goal Detail

#### Automated

- [x] 4.1 Build passes: `npm run build`
- [x] 4.2 Lint passes: `npm run lint`
- [x] 4.3 Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual

- [x] 4.4 Full dashboard check-in flow end-to-end
- [x] 4.5 Dashboard cards show pace, projection, status badges
- [x] 4.6 Goal detail history edit/delete works
- [x] 4.7 Payment-triggered celebration fires
- [x] 4.8 Active-only goals in check-in modal
