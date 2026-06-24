# Net Worth Panel Implementation Plan

## Overview

Implement roadmap slice S-07: a dashboard net worth panel where users manage assets and liabilities, see computed net worth, confirm an asset is still current without re-entering its amount, and receive a dismissable staleness prompt when the oldest asset has not been updated in over three months. Covers PRD FR-023–FR-027. Builds on F-01 (RLS pattern) and follows conventions from S-02 (CRUD API + validation) and S-03 (dashboard SSR + inline modals).

## Current State Analysis

The dashboard (`src/pages/dashboard.astro`) is a goals hub with check-in, projections, and celebration — no net worth UI. Supabase migrations exist for `profiles`, `savings_goals`, `goal_payments`, and `ai_checkin_requests` only; no `assets` or `liabilities` tables. No net-worth API routes, lib helpers, or components under `src/`. Profile already stores `relationship_status` for FR-003 label copy (`src/types/database.ts`, `ProfileForm.tsx`).

### Key Discoveries:

- Roadmap S-07 expects assets/liabilities tables following F-01 migration pattern (`context/foundation/roadmap.md:73, 158–168`)
- Hard delete is required for assets/liabilities (unlike goals' soft abandon) — follow `goal_payments` DELETE RLS policy pattern (`supabase/migrations/20260623140000_create_goal_payments.sql:27-28`)
- FR-026/FR-027 need a dedicated `last_updated_at` column on assets — `updated_at` alone cannot distinguish "confirm current" from other edits without conflating semantics
- Dashboard uses English UI copy today; net worth headline uses Polish possessives per PRD (Twoja/Wasza)
- No unit test framework — manual + RLS script verification matches prior slices
- Staleness banner dismiss has no existing pattern; `CelebrationModal` uses query-param one-shot dismiss (`src/pages/dashboard.astro:15`) — net worth staleness uses localStorage instead

## Desired End State

An authenticated user sees a net worth section above Active goals on `/dashboard`. With no data, a compact teaser shows the relationship-aware headline (Twoja/Wasza wartość netto) and an Add first asset CTA. After the first asset or liability is saved, the full panel expands: net worth total (assets minus liabilities, negative values shown with minus sign, same styling), assets sorted by amount descending with category labels, liabilities sorted by amount descending, inline modals for add/edit, confirm-before-delete for removal, and a per-row Still current action on each asset plus a banner CTA for the stalest asset when any asset's `last_updated_at` is older than three months. Banner is dismissable via localStorage keyed to the stalest asset identity. Confirm current refreshes `last_updated_at` without changing amount.

**Verification:** Add asset + liability → net worth computes correctly → edit amounts → confirm current on asset → delete with confirmation → seed stale asset → banner appears → dismiss persists → confirm clears staleness → married profile shows Wasza headline.

## What We're NOT Doing

- Net worth history or snapshots (PRD non-goal)
- Liability categories (PRD non-goal)
- Custom asset categories beyond closed list (PRD non-goal)
- Multi-currency — PLN only
- Linking payments to assets automatically (PRD non-goal)
- Dedicated `/net-worth` routes — all CRUD via dashboard inline modals
- Server-side staleness banner dismiss persistence
- Unit/integration test framework setup
- Middleware changes (panel lives on existing protected `/dashboard`)
- Charts or trend visualization

## Implementation Approach

Three phases in dependency order: (1) database schema with RLS, seed, and RLS tests; (2) API routes with shared validation matching the goals/profile contract; (3) dashboard UI with teaser-to-full-panel expansion, inline modals, and client-side staleness banner. Net worth calculation and staleness detection live in `src/lib/net-worth/` helpers used by both SSR (dashboard) and API responses where needed. Staleness banner dismiss uses localStorage value `{ stalestAssetId, lastUpdatedAt }` — banner hidden when stored value matches current stalest asset; re-shows when staleness identity changes.

## Critical Implementation Details

### Timing & lifecycle

`last_updated_at` on assets must be set to `now()` on insert and on any edit that changes `name`, `amount`, or `category`. The confirm endpoint must update **only** `last_updated_at` (amount unchanged) — implement as explicit column update, not a no-op re-save of the same amount through the edit endpoint. Staleness compares `now() - last_updated_at > interval '3 months'` using the **oldest** asset by `last_updated_at` among all user assets (if user has zero assets, no banner — liabilities alone do not trigger FR-027).

### User experience spec

Teaser vs full panel: when `assets.length + liabilities.length === 0`, render teaser only (headline + single CTA opening add-asset modal). After first save of any asset or liability, SSR re-renders full panel on redirect/reload (`window.location.reload()` or assign to `/dashboard` after modal success — match `GoalQuickPayment` pattern). Per-row Still current should be subtle (secondary button/link) — not hidden behind edit modal.

### State sequencing

Staleness banner localStorage key: `saved-net-worth-stale-dismiss` (optionally suffix with user id if multi-account same browser matters). Stored JSON: `{ assetId: string, lastUpdatedAt: string }`. On dismiss, save current stalest asset's id + `last_updated_at`. On render, hide banner if stored pair matches current stalest stale asset. Confirm current or edit asset updates `last_updated_at` → stored pair no longer matches → banner naturally clears without manual localStorage wipe.

---

## Phase 1: Schema & RLS

### Overview

Create `assets` and `liabilities` tables with RLS (including DELETE), seed data, RLS verification scripts, and regenerated TypeScript types.

### Changes Required:

#### 1. Assets and liabilities migration

**File**: `supabase/migrations/20260623170000_create_assets_and_liabilities.sql` (new)

**Intent**: Add persistence for net worth data with per-user isolation, constraints matching PRD, and timestamps supporting FR-026/FR-027.

**Contract**:

Table `public.assets`:

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL, CHECK (char_length(name) BETWEEN 1 AND 100) |
| amount | NUMERIC(12,2) | NOT NULL, CHECK (amount >= 0) |
| category | TEXT | NOT NULL, CHECK (category IN ('cash', 'savings', 'investments', 'real_estate', 'other')) |
| last_updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

Table `public.liabilities`:

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL, CHECK (char_length(name) BETWEEN 1 AND 100) |
| amount | NUMERIC(12,2) | NOT NULL, CHECK (amount >= 0) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

Indexes: `assets_user_id_idx` on `(user_id)`; `liabilities_user_id_idx` on `(user_id)`.

RLS on both tables — full CRUD per user (copy goal_payments pattern):

- `{table}_select_own`: SELECT where `auth.uid() = user_id`
- `{table}_insert_own`: INSERT with CHECK `auth.uid() = user_id`
- `{table}_update_own`: UPDATE USING + WITH CHECK `auth.uid() = user_id`
- `{table}_delete_own`: DELETE where `auth.uid() = user_id`

Triggers: `set_assets_updated_at` and `set_liabilities_updated_at` BEFORE UPDATE → `set_updated_at()`.

No DB trigger on `last_updated_at` — application sets it on insert/update/confirm for explicit FR-026 semantics.

#### 2. Update seed file

**File**: `supabase/seed.sql`

**Intent**: Add sample assets and liabilities for local dev and manual staleness testing.

**Contract**: For test user `00000000-0000-0000-0000-000000000001`, insert at least: 2 assets (mixed categories, e.g. 50000 savings + 120000 real_estate), 1 liability (e.g. 80000 mortgage). Include one asset with `last_updated_at` older than 3 months (e.g. `now() - interval '4 months'`) to exercise FR-027 in Phase 3 manual testing.

#### 3. RLS verification scripts

**Files**: `supabase/tests/rls-assets.sql`, `supabase/tests/rls-liabilities.sql` (new)

**Intent**: Mirror `rls-savings-goals.sql` — assert user A cannot SELECT/UPDATE/DELETE user B's rows.

**Contract**: Each script sets JWT claims for two users, verifies cross-user SELECT returns zero rows, cross-user UPDATE/DELETE affect zero rows, own-user CRUD succeeds.

#### 4. TypeScript database types

**File**: `src/types/database.ts`

**Intent**: Regenerate after migration so Supabase client types include both new tables.

**Contract**: Run `npx supabase gen types typescript --local > src/types/database.ts` after `supabase db reset`. Confirm `Database['public']['Tables']['assets']` and `['liabilities']` exist.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- RLS scripts pass: run `supabase/tests/rls-assets.sql` and `supabase/tests/rls-liabilities.sql` against local DB
- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Supabase Studio shows both tables with correct columns and CHECK constraints
- Seed data visible for test user including one stale-dated asset
- Manual INSERT asset as test user succeeds; second user cannot see it in Studio when impersonating via RLS test

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Net Worth API

### Overview

Add validation helpers and POST API routes for asset/liability CRUD plus asset confirm-current, following the form-urlencoded + JSON response contract from goals and profile APIs.

### Changes Required:

#### 1. Shared net worth validation helpers

**File**: `src/lib/net-worth/validation.ts` (new)

**Intent**: Centralize parsing rules shared by all net worth API routes.

**Contract**: Export:

- `parseName(value)` — trim, 1–100 chars (same rules as goals)
- `parseAmount(value)` — non-negative number, max 2 decimal places, reject NaN/empty
- `parseAssetCategory(value)` — must be one of `cash | savings | investments | real_estate | other`
- `formatAssetRow(row)` / `formatLiabilityRow(row)` — serialize numeric fields for JSON
- `ASSET_CATEGORIES` constant array for UI select options

#### 2. Net worth computation helpers

**File**: `src/lib/net-worth/compute.ts` (new)

**Intent**: Single source for net worth math and staleness detection used by dashboard SSR and optionally API.

**Contract**: Export:

- `computeNetWorth(assets, liabilities): number` — sum(asset.amount) - sum(liability.amount)
- `getStalestAsset(assets): Asset | null` — asset with minimum `last_updated_at`; null if no assets
- `isAssetStale(lastUpdatedAt: string, now = new Date()): boolean` — true when older than 3 calendar months (use consistent logic: e.g. compare dates with `setMonth(now.getMonth() - 3)` or Postgres-aligned 3-month interval documented in one place)
- `getNetWorthHeadline(relationshipStatus: string | null): string` — `married` or `partnership` → `Wasza wartość netto`; else → `Twoja wartość netto`

#### 3. Create asset endpoint

**File**: `src/pages/api/assets/index.ts` (new)

**Intent**: Insert asset for authenticated user; set `last_updated_at = now()` on insert.

**Contract**: `POST`. Form fields: `name`, `amount`, `category`. Auth → 401. Validation helpers. Insert with `user_id`, `last_updated_at: new Date().toISOString()`. Returns `{ success: true, asset: {...} }`.

#### 4. Update asset endpoint

**File**: `src/pages/api/assets/[id].ts` (new)

**Intent**: Update asset name, amount, category; refresh `last_updated_at`.

**Contract**: `POST`. UUID path param. Load where `id AND user_id` → 404 if missing. Validate fields. Update including `last_updated_at: now()`. Returns `{ success: true, asset: {...} }`.

#### 5. Delete asset endpoint

**File**: `src/pages/api/assets/[id]/delete.ts` (new)

**Intent**: Hard-delete asset (FR-023).

**Contract**: `POST`. UUID param. Delete where `id AND user_id`. Returns `{ success: true }` or 404. Follow `goal_payments` delete route structure.

#### 6. Confirm asset current endpoint

**File**: `src/pages/api/assets/[id]/confirm.ts` (new)

**Intent**: FR-026 — refresh `last_updated_at` without changing `amount`, `name`, or `category`.

**Contract**: `POST`. UUID param. Load asset → 404. Update `{ last_updated_at: now() }` only (do not accept amount from form). Returns `{ success: true, asset: {...} }`.

#### 7. Liability CRUD endpoints

**Files**: `src/pages/api/liabilities/index.ts`, `src/pages/api/liabilities/[id].ts`, `src/pages/api/liabilities/[id]/delete.ts` (new)

**Intent**: Create, update, hard-delete liabilities (FR-024).

**Contract**: Same POST + form-urlencoded + auth pattern as assets but fields are `name` and `amount` only. Delete follows assets delete pattern.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- POST create asset with valid category → 200, row in DB with `last_updated_at` ≈ now
- POST create asset with invalid category → 400
- POST create liability → 200
- POST update asset amount → `last_updated_at` advances
- POST confirm asset → amount unchanged, `last_updated_at` advances
- POST delete asset/liability → row removed
- POST create/update/delete unauthenticated → 401
- User B cannot mutate user A's asset (404 or RLS block)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard Panel UI

### Overview

Integrate net worth into dashboard SSR above Active goals: teaser empty state, full panel with sorted lists, inline modals for CRUD, confirm dialogs for delete, per-row confirm current, and dismissable staleness banner with localStorage.

### Changes Required:

#### 1. Asset form modal

**File**: `src/components/net-worth/AssetFormModal.tsx` (new)

**Intent**: Inline create/edit asset from dashboard without dedicated routes.

**Contract**: Props `{ mode: 'create' | 'edit'; initial?: { id, name, amount, category }; open: boolean; onOpenChange; onSuccess: () => void }`. Fields: name (max 100), amount (step 0.01, min 0), category `<select>` from `ASSET_CATEGORIES` with human labels (Cash, Savings, Investments, Real estate, Other). Client validation mirrors server. Submit via fetch POST to `/api/assets` or `/api/assets/[id]`. Uses `FormField`, `SubmitButton`, `ServerError`, `disabled={loading}`. On success call `onSuccess` → parent reloads dashboard.

#### 2. Liability form modal

**File**: `src/components/net-worth/LiabilityFormModal.tsx` (new)

**Intent**: Inline create/edit liability from dashboard.

**Contract**: Same modal pattern as asset form but name + amount only. POST to `/api/liabilities` or `/api/liabilities/[id]`.

#### 3. Staleness banner component

**File**: `src/components/net-worth/StaleAssetBanner.tsx` (new)

**Intent**: FR-027 soft prompt for stale assets with dismiss + confirm CTA.

**Contract**: Props `{ stalestAsset: { id, name, lastUpdatedAt }; onConfirm: () => void; onDismiss: () => void }`. Copy: informational tone (e.g. "{name} hasn't been updated in over 3 months — still accurate?"). Actions: Still current (calls confirm API for stalest asset id) and Dismiss (writes localStorage `{ assetId, lastUpdatedAt }` matching stalest). Hidden when localStorage matches current stalest identity. Cosmic card styling consistent with dashboard (not layout `Banner.astro` light theme).

#### 4. Net worth panel component

**File**: `src/components/net-worth/NetWorthPanel.tsx` (new)

**Intent**: Main React island orchestrating teaser/full states, lists, modals, banner, and delete confirmations.

**Contract**: Props from SSR:

```typescript
{
  headline: string;
  netWorth: number;
  assets: Array<{ id, name, amount, category, lastUpdatedAt }>;
  liabilities: Array<{ id, name, amount }>;
  stalestAsset: { id, name, lastUpdatedAt } | null;
  hasAnyItems: boolean;
}
```

Behavior:

- `!hasAnyItems`: teaser card — headline, net worth hidden or shown as em dash, primary CTA Add your first asset → opens AssetFormModal create
- `hasAnyItems`: full panel — headline, formatted net worth (reuse dashboard PLN formatting pattern), assets section sorted amount DESC with category badge, liabilities section sorted amount DESC, Add asset / Add liability buttons, edit/delete/Still current per row
- Delete: `window.confirm()` or inline confirm step before POST delete
- Still current per row: POST `/api/assets/[id]/confirm`, reload on success
- Mount `StaleAssetBanner` when `stalestAsset` non-null and not dismissed
- `client:load` island

Negative net worth: display with minus sign, same text styling as positive (no amber, no alternate label).

#### 5. Dashboard SSR integration

**File**: `src/pages/dashboard.astro`

**Intent**: Load assets/liabilities server-side and render `NetWorthPanel` above Active goals section.

**Contract**: When `supabase && user`, query:

- `assets`: select `id, name, amount, category, last_updated_at` where `user_id = user.id`, order by `amount DESC`
- `liabilities`: select `id, name, amount` where `user_id = user.id`, order by `amount DESC`

Compute via helpers: `netWorth`, `headline` from `profile?.relationship_status`, `stalestAsset`, `hasAnyItems = assets.length + liabilities.length > 0`.

Insert `<NetWorthPanel ... client:load />` between greeting block and Active goals heading (`dashboard.astro` ~line 115). Pass formatted props. Reuse local `formatPln()` or share helper.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Empty test user (no assets/liabilities): teaser with Twoja headline and Add CTA only
- Profile `relationship_status = married`: headline shows Wasza wartość netto
- Add first asset via modal → full panel appears with net worth
- Add liability → net worth recalculates (assets − liabilities)
- Negative net worth displays with minus, same styling
- Edit asset via modal → saves and refreshes list
- Delete asset → confirm dialog → removed
- Still current on row → `last_updated_at` updates, staleness banner clears if that was stalest
- Seed stale asset → banner shows with stalest name → Dismiss hides until localStorage cleared or staleness identity changes
- Banner Still current confirms stalest asset
- User B cannot see user A's net worth data on dashboard

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- No unit test framework configured — manual verification for MVP

### Integration Tests:

- `supabase/tests/rls-assets.sql` and `rls-liabilities.sql` validate per-user isolation
- API manual matrix in Phase 2 success criteria

### Manual Testing Steps:

1. Teaser flow: new user dashboard → teaser only → add asset → full panel
2. CRUD flow: add/edit/delete asset and liability via modals with confirm on delete
3. Net worth math: verify sum with mixed positive/negative result
4. Confirm current: row action and banner action both refresh timestamp without amount change
5. Staleness: seed 4-month-old asset → banner → dismiss → reload still hidden → update asset → banner stays hidden
6. Relationship labels: toggle profile married/single → headline switches Twoja/Wasza
7. RLS: second test user sees empty net worth on dashboard

## Performance Considerations

- Dashboard adds two indexed queries by `user_id` — acceptable at MVP scale (typical user has tens of rows, not thousands)
- Net worth computed in SSR from fetched rows — no N+1
- localStorage read/write client-side only — negligible
- Single React island for entire panel — one hydration boundary

## Migration Notes

- Forward-only migration on top of existing schema
- Seed user gains sample assets/liabilities including one stale asset on `supabase db reset`
- No changes to goals/check-in flows — panel is additive above Active goals
- Parallel slice S-05 (landing) may touch unrelated files; avoid editing `middleware.ts` in this change

## References

- F-01 plan: `context/changes/supabase-schema-rls-baseline/plan.md`
- S-02 plan: `context/changes/savings-goals-lifecycle/plan.md`
- S-03 plan: `context/changes/manual-checkin-payments-projections/plan.md`
- PRD: `context/foundation/prd.md` (FR-023–FR-027, FR-003 label note)
- Roadmap: `context/foundation/roadmap.md` (S-07)
- Dashboard: `src/pages/dashboard.astro`
- Payment delete pattern: `src/pages/api/goals/[id]/payments/[paymentId]/delete.ts`
- Goal payments RLS: `supabase/migrations/20260623140000_create_goal_payments.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & RLS

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — 95934a4
- [x] 1.2 RLS scripts pass: `rls-assets.sql` and `rls-liabilities.sql` — 95934a4
- [x] 1.3 Build passes: `npm run build` — 95934a4
- [x] 1.4 Lint passes: `npm run lint` — 95934a4
- [x] 1.5 Type checking passes: `npx astro sync && npx tsc --noEmit` — 95934a4

#### Manual

- [x] 1.6 Studio shows tables, constraints, and seed data including stale asset — 95934a4
- [x] 1.7 RLS isolation verified for assets and liabilities — 95934a4

### Phase 2: Net Worth API

#### Automated

- [x] 2.1 Build passes: `npm run build` — 30eadd0
- [x] 2.2 Lint passes: `npm run lint` — 30eadd0
- [x] 2.3 Type checking passes: `npx astro sync && npx tsc --noEmit` — 30eadd0

#### Manual

- [x] 2.4 Asset and liability CRUD endpoints behave per contract — 30eadd0
- [x] 2.5 Confirm-current updates last_updated_at only; validation and RLS verified — 30eadd0

### Phase 3: Dashboard Panel UI

#### Automated

- [x] 3.1 Build passes: `npm run build` — 3589c1c
- [x] 3.2 Lint passes: `npm run lint` — 3589c1c
- [x] 3.3 Type checking passes: `npx astro sync && npx tsc --noEmit` — 3589c1c

#### Manual

- [x] 3.4 Teaser, full panel expansion, and relationship headline verified — 3589c1c
- [x] 3.5 CRUD modals, delete confirm, net worth math, and negative display verified — 3589c1c
- [x] 3.6 Staleness banner, dismiss persistence, and confirm-current flows verified end-to-end — 3589c1c
