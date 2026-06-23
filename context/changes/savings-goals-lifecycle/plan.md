# Savings Goals Lifecycle Implementation Plan

## Overview

Implement the full savings goal lifecycle for roadmap slice S-02: create, edit, and abandon goals; auto-complete at 100% progress; celebration moment with confetti; and an archive for completed and abandoned goals. Covers PRD requirements FR-005–FR-007, FR-009–FR-010, and FR-030. Builds on F-01 (`profiles` table + RLS pattern) and follows conventions from S-01 (`auth-onboarding-profile`).

## Current State Analysis

The dashboard is a placeholder (`src/pages/dashboard.astro:20-23`) with no goal data. F-01 delivered the `profiles` migration with RLS, `set_updated_at()`, and TypeScript types at `src/types/database.ts` — goals and payments tables do not exist. Auth middleware protects `/dashboard`, `/onboarding`, and `/profile` (`src/middleware.ts:4`). The profile API + `ProfileForm` pattern (`src/pages/api/profile.ts`, `src/components/profile/ProfileForm.tsx`) provides the template for goal API routes and shared forms.

### Key Discoveries:

- F-01 migration explicitly documents the RLS + trigger pattern for downstream tables (`supabase/migrations/20260610120000_create_profiles.sql:14-19, 36`)
- No `src/lib/services/` layer — business logic lives in API routes (matches S-01)
- No confetti library in `package.json` — `canvas-confetti` needed for FR-010
- Progress to 100% requires `saved_amount`; payments table is S-03 scope — denormalized column updated by S-03, testable in S-02 via seed/manual update
- Impl-review lessons from S-01: `disabled={loading}` on submit, server-side validation, check Supabase errors before redirect (`context/changes/auth-onboarding-profile/reviews/impl-review.md`)

## Desired End State

An authenticated user can create a savings goal (name, target amount in PLN, optional deadline) from `/goals/new`, see active goals on the dashboard with progress bars (capped at 100%), edit an active goal at `/goals/[id]/edit` (with inline warning when target or deadline changes), and abandon an active goal (status → `abandoned`, data preserved). When `saved_amount >= target_amount`, a DB trigger sets status to `completed` and the user sees a celebration modal with soft confetti (via `?celebrated=<goalId>` on dashboard). Completed and abandoned goals appear in `/goals/archive`, visually separated. No hard delete. No restore (FR-008 dropped).

**Verification:** Create goal → appears on dashboard → edit name/target → abandon another goal → seed/update `saved_amount` to target → trigger completes → celebration modal → goal moves to archive section → second user cannot see first user's goals (RLS).

## What We're NOT Doing

- Payment recording, check-in, projections, or status classification (on track / behind / ahead) — S-03
- AI check-in parsing — S-04
- Restore abandoned/completed goals to active (FR-008 dropped)
- Hard delete of goals (PRD non-goal)
- Goal detail page with charts or payment history
- Forcing first goal during onboarding
- Multi-currency — PLN only
- Unit/integration test framework setup — manual verification for MVP

## Implementation Approach

Three phases in dependency order: (1) database schema with RLS and auto-complete trigger, (2) API routes with server validation matching the profile API contract, (3) UI pages and celebration. Auto-complete runs in a `BEFORE INSERT OR UPDATE` trigger so S-03 payment saves automatically complete goals without duplicating logic. Celebration is a client-side React island triggered by a query param — S-03 will redirect to `/dashboard?celebrated=<id>` after a payment completes a goal.

## Critical Implementation Details

### Timing & lifecycle

Auto-complete must live in the database trigger, not only in API handlers — S-03 will update `saved_amount` directly via Supabase and must hit the same completion path. The celebration modal must fire once per completion event (query param), not on every dashboard load for already-completed goals — dismiss clears the param via `history.replaceState`.

### State sequencing

When editing `target_amount` downward so `saved_amount >= target_amount`, the completion trigger fires on the same UPDATE — the API response should include `{ completed: true }` so the edit form can redirect to `/dashboard?celebrated=<id>` instead of a stale "saved" message.

---

## Phase 1: Schema & RLS

### Overview

Create the `savings_goals` table with denormalized `saved_amount`, status lifecycle, auto-complete trigger, TypeScript types, seed data, and RLS verification script.

### Changes Required:

#### 1. Savings goals migration

**File**: `supabase/migrations/20260623120000_create_savings_goals.sql` (new)

**Intent**: Create the goals table with all fields needed for S-02 lifecycle and S-03 payment integration. Enable RLS with per-user isolation. Reuse `set_updated_at()`. Add trigger that auto-completes active goals when `saved_amount >= target_amount`.

**Contract**:

Table `public.savings_goals`:

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL, CHECK (char_length(name) BETWEEN 1 AND 100) |
| target_amount | NUMERIC(12,2) | NOT NULL, CHECK (target_amount > 0) |
| saved_amount | NUMERIC(12,2) | NOT NULL, DEFAULT 0, CHECK (saved_amount >= 0) |
| deadline | DATE | nullable |
| status | TEXT | NOT NULL, DEFAULT 'active', CHECK (status IN ('active', 'completed', 'abandoned')) |
| completed_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

Index: `savings_goals_user_id_status_idx` on `(user_id, status)` for dashboard/archive queries.

RLS policies (replace `profiles` pattern — goals need INSERT):

- `savings_goals_select_own`: SELECT where `auth.uid() = user_id`
- `savings_goals_insert_own`: INSERT with CHECK `auth.uid() = user_id`
- `savings_goals_update_own`: UPDATE where `auth.uid() = user_id` (USING + WITH CHECK)

No DELETE policy — soft delete via status only.

Trigger `set_savings_goals_updated_at`: BEFORE UPDATE, executes existing `set_updated_at()`.

Function `check_savings_goal_completion()`: BEFORE INSERT OR UPDATE OF saved_amount, target_amount, status — when `NEW.status = 'active'` AND `NEW.saved_amount >= NEW.target_amount`, set `NEW.status = 'completed'` and `NEW.completed_at = now()`.

#### 2. Update seed file

**File**: `supabase/seed.sql`

**Intent**: Add sample goals for local dev: one active goal, one completed goal (for archive UI testing), one abandoned goal. Enables dashboard and archive verification without manual SQL.

**Contract**: Insert 3 rows for test user `00000000-0000-0000-0000-000000000001` with varied statuses. Completed row has `saved_amount = target_amount` and `completed_at` set. Amounts in PLN (e.g. 5000.00 target, 2500.00 saved for active).

#### 3. RLS verification script

**File**: `supabase/tests/rls-savings-goals.sql` (new)

**Intent**: Copy the pattern from `supabase/tests/rls-profiles.sql` — verify user A cannot SELECT/UPDATE user B's goals.

**Contract**: Script sets JWT claims for two users, asserts cross-user SELECT returns zero rows and cross-user UPDATE affects zero rows.

#### 4. TypeScript database types

**File**: `src/types/database.ts`

**Intent**: Regenerate types after migration so Supabase client is fully typed for `savings_goals`.

**Contract**: Run `npx supabase gen types typescript --local > src/types/database.ts` after `supabase db reset`. Confirm `Database['public']['Tables']['savings_goals']` exists with Row/Insert/Update types.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- RLS script passes: `psql` against local DB running `supabase/tests/rls-savings-goals.sql`
- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Supabase Studio shows `savings_goals` table with correct columns and CHECK constraints
- Seed data visible: 1 active, 1 completed, 1 abandoned for test user
- Manually UPDATE active goal's `saved_amount` to `>= target_amount` in Studio → status becomes `completed`, `completed_at` populated
- Lowering `target_amount` on active goal with sufficient `saved_amount` also completes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Goal API

### Overview

Add API routes for create, edit, and abandon operations with server-side validation, auth checks, and JSON responses matching the profile API pattern.

### Changes Required:

#### 1. Shared goal validation helpers

**File**: `src/lib/goals/validation.ts` (new)

**Intent**: Centralize validation rules used by all goal API routes — keeps server validation DRY and consistent with schema constraints.

**Contract**: Export functions:

- `parseGoalName(value: string | null): { ok: true; name: string } | { ok: false; error: string }` — trim, 1–100 chars
- `parseTargetAmount(value: string | null): { ok: true; amount: number } | { ok: false; error: string }` — positive number, max 2 decimal places
- `parseDeadline(value: string | null): { ok: true; deadline: string | null } | { ok: false; error: string }` — empty → null; otherwise valid ISO date `YYYY-MM-DD`
- `formatGoalRow(row)` — optional helper for serializing numeric fields to JSON numbers/strings consistently

#### 2. Create goal endpoint

**File**: `src/pages/api/goals/index.ts` (new)

**Intent**: Accept POST with goal fields, insert row for authenticated user with `status = 'active'` and `saved_amount = 0`.

**Contract**: `POST` export. Form data fields: `name`, `target_amount`, `deadline` (optional). Auth via `context.locals.user` → 401. Uses validation helpers. Inserts via `supabase.from('savings_goals').insert({ user_id, name, target_amount, deadline })`. Returns JSON `{ success: true, goal: { id, ... } }` or `{ success: false, error: string }`. Generic error messages — no raw Supabase errors to client.

#### 3. Update goal endpoint

**File**: `src/pages/api/goals/[id].ts` (new)

**Intent**: Accept PATCH/POST for editing an active goal's name, target_amount, and deadline (FR-006). Reject edits on completed or abandoned goals.

**Contract**: `POST` export (matches form-urlencoded pattern from profile API). Path param `id` must be UUID. Loads goal where `id = :id AND user_id = auth user`. Returns 404 if not found, 409 if status ≠ `active`. Applies validation helpers. Updates row. After update, re-read row (trigger may have changed status to `completed`). Returns JSON `{ success: true, goal: {...}, completed: boolean }` — `completed: true` when status is now `completed` (for redirect to celebration).

#### 4. Abandon goal endpoint

**File**: `src/pages/api/goals/[id]/abandon.ts` (new)

**Intent**: Soft-delete an active goal by setting `status = 'abandoned'` (FR-007). Preserves all data.

**Contract**: `POST` export. Path param `id`. Only `active` goals can be abandoned — 409 otherwise. Returns JSON `{ success: true }` or error. No hard delete.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- POST create with valid data → 200, goal in DB with `status = active`, `saved_amount = 0`
- POST create with empty name → 400
- POST create with name > 100 chars → 400
- POST create with target ≤ 0 → 400
- POST create unauthenticated → 401
- POST update active goal → fields saved
- POST update completed/abandoned goal → 409
- POST update lowering target to ≤ saved_amount → goal completed, response `completed: true`
- POST abandon active goal → status `abandoned`
- POST abandon completed goal → 409
- User B cannot update/abandon user A's goal (RLS — returns 404 or empty)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Goals UI

### Overview

Build shared `GoalForm`, create/edit pages, dashboard with active goals list, archive page, celebration modal with confetti, and navigation/middleware updates.

### Changes Required:

#### 1. Install canvas-confetti

**File**: `package.json`

**Intent**: Add lightweight confetti library for FR-010 celebration moment.

**Contract**: `npm install canvas-confetti` and `npm install -D @types/canvas-confetti`. Import in celebration component only — no global script tag.

#### 2. Shared GoalForm component

**File**: `src/components/goals/GoalForm.tsx` (new)

**Intent**: Reusable form for create and edit flows. Shows inline amber warning when `target_amount` or `deadline` differs from initial values (FR-006). Submits via fetch to create or update API.

**Contract**: Props `{ mode: 'create' | 'edit'; initial: { name, target_amount, deadline } | null; goalId?: string; onSuccess: (result: { completed?: boolean; goalId: string }) => void }`. Fields: name (text, maxLength 100), target amount (number input, step 0.01, min 0.01), deadline (date input, optional — empty allowed). Client validation mirrors server rules. `SubmitButton` with `disabled={loading}`. On create success → `onSuccess({ goalId })`. On edit success with `completed` → `onSuccess({ goalId, completed: true })`. Amounts displayed/labeled as PLN (zł). Reuses `FormField`, `SubmitButton`, `ServerError`.

#### 3. Create goal page

**File**: `src/pages/goals/new.astro` (new)

**Intent**: Protected page with heading and `GoalForm` in create mode. Redirects to dashboard on success.

**Contract**: SSR auth check via middleware. Renders `GoalForm` with `client:load`, `mode="create"`. `onSuccess` navigates to `/dashboard`. Cosmic card styling consistent with profile page. Back link to dashboard.

#### 4. Edit goal page

**File**: `src/pages/goals/[id]/edit.astro` (new)

**Intent**: Protected page for editing an active goal. Includes abandon action with confirmation.

**Contract**: SSR loads goal by id + user_id from Supabase. 404 if not found. Redirect to archive or dashboard if not active. Renders `GoalForm` in edit mode with initial values. Separate "Abandon goal" button (destructive styling) POSTs to `/api/goals/[id]/abandon` via fetch, redirects to `/goals/archive` on success. `onSuccess` from form: if `completed` → `/dashboard?celebrated=<id>`, else stay with success message or redirect to dashboard.

#### 5. Dashboard active goals

**File**: `src/pages/dashboard.astro`

**Intent**: Replace placeholder with list of active goals, progress bars (capped at 100%), and CTAs. Host celebration modal.

**Contract**: SSR query `savings_goals` where `user_id = user.id AND status = 'active'` ordered by `created_at DESC`. Each card shows: name, saved/target in PLN, progress bar `min(saved/target, 1) * 100`, optional deadline formatted. Link to edit. Empty state: message + "Add goal" button → `/goals/new`. Include `CelebrationModal` island with `celebratedGoalId` from URL search param `celebrated`. Pass completed goal name from SSR data or dedicated query.

#### 6. Celebration modal component

**File**: `src/components/goals/CelebrationModal.tsx` (new)

**Intent**: FR-010 brand moment — warm congratulatory message + soft confetti burst when a goal completes.

**Contract**: Props `{ goalId: string | null; goalName: string | null; onDismiss: () => void }`. When `goalId` is set, open modal on mount, fire `canvas-confetti` once (moderate particle count, short duration — "soft" not overwhelming). Message in Polish or English matching app tone (e.g. "Cel osiągnięty! Gratulacje — {name}"). Dismiss button clears modal; parent clears `?celebrated` via `history.replaceState`. Do not re-fire confetti on re-render.

#### 7. Archive page

**File**: `src/pages/goals/archive.astro` (new)

**Intent**: FR-030 — view completed and abandoned goals in visually separated sections.

**Contract**: SSR queries: completed goals (`status = 'completed'`, order by `completed_at DESC`), abandoned goals (`status = 'abandoned'`, order by `updated_at DESC`). Two sections with distinct headings/badges (e.g. green accent for completed, muted for abandoned). Read-only cards — no edit/abandon. Show final saved amount, target, completion/abandon date. Link back to dashboard. Empty sections show brief placeholder text.

#### 8. Middleware and navigation

**Files**: `src/middleware.ts`, `src/components/Topbar.astro`

**Intent**: Protect goal routes. Add navigation links for goals flow.

**Contract**: Add `/goals` prefix to `PROTECTED_ROUTES` (covers `/goals/new`, `/goals/archive`, `/goals/[id]/edit`). Topbar authenticated links: add "Archive" → `/goals/archive` (Dashboard link remains). Optional: no separate "Goals" link — dashboard is the hub.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`
- `/goals/new`, `/goals/archive` routes exist and are protected

#### Manual Verification:

- Dashboard shows seed active goal with progress bar capped at 100%
- "Add goal" → create form → new goal appears on dashboard
- Edit goal → change name saves; changing target/deadline shows inline warning before submit
- Abandon goal from edit page → appears in archive abandoned section
- Update seed active goal `saved_amount` to target in Studio → visit `/dashboard?celebrated=<id>` → confetti + modal → dismiss clears param
- Edit target downward to trigger completion → redirects to celebration
- Archive shows completed and abandoned sections with visual distinction
- Unauthenticated access to `/goals/new` redirects to signin
- User B cannot see user A's goals on dashboard or archive

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- No unit test framework configured — manual verification for MVP

### Integration Tests:

- `supabase/tests/rls-savings-goals.sql` validates per-user goal isolation
- Auto-complete trigger verified in Phase 1 manual steps

### Manual Testing Steps:

1. Full create flow: dashboard → add goal → fill form → goal listed with 0% progress
2. Edit flow: change name, target (see warning), deadline (see warning) → save persists
3. Abandon flow: abandon from edit → gone from dashboard → visible in archive
4. Completion flow: set saved_amount ≥ target (Studio or lower target via edit) → celebration → goal in archive completed section
5. Overpayment: saved_amount > target → completes, dashboard bar capped at 100%
6. Edge cases: 100-char name accepted, 101 rejected; target 0 rejected; unauthenticated routes blocked
7. RLS: second test user sees empty dashboard/archive

## Performance Considerations

- Dashboard loads one query for active goals — indexed by `(user_id, status)`. Acceptable at MVP scale.
- Confetti runs once client-side — negligible impact.
- Middleware unchanged beyond route list — no extra DB calls per request (goals fetched in page SSR only).

## Migration Notes

- Forward-only migration on top of F-01 profiles migration
- Existing seed user gains sample goals on `supabase db reset`
- S-03 contract: payment save endpoints must UPDATE `savings_goals.saved_amount` (sum or increment) — trigger handles completion; redirect to `/dashboard?celebrated=<id>` when payment causes completion

## References

- F-01 plan: `context/changes/supabase-schema-rls-baseline/plan.md`
- S-01 plan: `context/changes/auth-onboarding-profile/plan.md`
- PRD: `context/foundation/prd.md` (FR-005–FR-007, FR-009–FR-010, FR-030)
- Roadmap: `context/foundation/roadmap.md` (S-02)
- Profiles migration pattern: `supabase/migrations/20260610120000_create_profiles.sql`
- Profile API pattern: `src/pages/api/profile.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & RLS

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 8031c63
- [x] 1.2 RLS script passes: `supabase/tests/rls-savings-goals.sql` — 8031c63
- [x] 1.3 Build passes: `npm run build` — 8031c63
- [x] 1.4 Lint passes: `npm run lint` — 8031c63
- [x] 1.5 Type checking passes: `npx astro sync && npx tsc --noEmit` — 8031c63

#### Manual

- [x] 1.6 Studio shows table, constraints, and seed goals — 8031c63
- [x] 1.7 Auto-complete trigger fires when saved_amount reaches target — 8031c63

### Phase 2: Goal API

#### Automated

- [x] 2.1 Build passes: `npm run build` — 907e224
- [x] 2.2 Lint passes: `npm run lint` — 907e224
- [x] 2.3 Type checking passes: `npx astro sync && npx tsc --noEmit` — 907e224

#### Manual

- [x] 2.4 Create, update, abandon endpoints behave per contract — 907e224
- [x] 2.5 Validation rejects invalid input; RLS blocks cross-user access — 907e224

### Phase 3: Goals UI

#### Automated

- [x] 3.1 Build passes: `npm run build`
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 Type checking passes: `npx astro sync && npx tsc --noEmit`
- [x] 3.4 Goal routes exist and are protected

#### Manual

- [ ] 3.5 Dashboard, create, edit, archive, and celebration flows work end-to-end
- [ ] 3.6 Edit warning, progress cap, and archive visual separation verified
