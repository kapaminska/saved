# Supabase Migrations + RLS Baseline — Implementation Plan

## Overview

Enable Supabase migration tooling (currently unconfigured), create the `profiles` table with all PRD-specified columns, enforce row-level security so each user can only access their own data, auto-create a profile row on signup via a DB trigger, and provide a seed file for local development. This is the foundation slice (F-01) that unblocks S-01 (auth/onboarding), S-02 (goals), and S-03 (payments).

## Current State Analysis

- **Supabase CLI** installed (`supabase: ^2.23.4` in devDependencies) but never used for migrations — no `supabase/migrations/` directory exists.
- **`supabase/config.toml`** has migrations enabled (line 55) but `schema_paths = []` (line 58). The `seed.sql` path is referenced (line 65) but the file doesn't exist.
- **Auth layer** is wired: `@supabase/ssr` cookie-based sessions, `getUser()` in middleware, three API endpoints (signin/signup/signout). Auth works against `auth.users` — no application tables exist.
- **No `src/types.ts`** — database types will need a home.

### Key Discoveries:

- `supabase/config.toml:58` — `schema_paths = []` confirms no declarative schema; we use the imperative migration-based workflow (files in `supabase/migrations/`).
- `src/middleware.ts:11` — `supabase.auth.getUser()` already resolves the authenticated user on every request; the `id` from this user is the FK for `profiles.id`.
- `src/lib/supabase.ts:6-8` — client returns `null` when env vars missing; any code touching the DB must handle this gracefully.

## Desired End State

- `supabase/migrations/` directory exists with one migration file that creates the `profiles` table, enables RLS, creates policies, and wires the auto-create trigger.
- Running `npx supabase db reset` locally applies the migration cleanly and the trigger creates a profile row for every new auth user.
- RLS isolation verified: user A cannot SELECT or UPDATE user B's profile.
- `supabase/seed.sql` creates a test user + profile for local dev.
- Database TypeScript types generated and available at `src/types/database.ts`.
- The migration file serves as a documented pattern (table + RLS + trigger) for S-02 and S-03 to follow.

## What We're NOT Doing

- **Goals or payments tables** — S-02 and S-03 own those schemas.
- **Magic link migration** — S-01's scope; current email+password auth works for dev/testing.
- **Profile UI or API endpoints** — S-01 builds the profile page and onboarding flow.
- **Observability** — no logging/metrics in this foundation slice.
- **Production Supabase setup** — this slice targets local dev; remote migration is a deploy concern.

## Implementation Approach

Single migration file with the full `profiles` schema, RLS policies, a reusable `set_updated_at()` trigger function, and a `handle_new_user()` trigger on `auth.users`. Seed file creates a test user via direct `auth.users` insert (local Supabase only). TypeScript database types generated via `supabase gen types` and placed in `src/types/database.ts`.

## Phase 1: Migration Infrastructure + Profiles Schema

### Overview

Create the migration directory, write the migration SQL, generate TypeScript types, and create the seed file. This is the entire authoring phase.

### Changes Required:

#### 1. Migration directory

**File**: `supabase/migrations/` (new directory)

**Intent**: Create the directory that Supabase CLI expects for imperative migrations.

**Contract**: Empty directory; the CLI auto-discovers `.sql` files inside it.

#### 2. Profiles migration

**File**: `supabase/migrations/20260610120000_create_profiles.sql` (new file)

**Intent**: Create the `profiles` table with all PRD-specified columns (FR-002, FR-003), enable RLS with per-user isolation policies, create a reusable `set_updated_at()` function, and wire a trigger that auto-creates a profile row when a new user signs up in `auth.users`.

**Contract**:

Table `public.profiles`:
| Column              | Type        | Constraints                                        |
|---------------------|-------------|----------------------------------------------------|
| id                  | UUID        | PK, FK → auth.users(id) ON DELETE CASCADE          |
| display_name        | TEXT        | nullable                                           |
| date_of_birth       | DATE        | nullable                                           |
| retirement_age      | INTEGER     | nullable, CHECK (retirement_age BETWEEN 30 AND 100)|
| relationship_status | TEXT        | nullable                                           |
| created_at          | TIMESTAMPTZ | NOT NULL, DEFAULT now()                            |
| updated_at          | TIMESTAMPTZ | NOT NULL, DEFAULT now()                            |

RLS policies on `public.profiles`:
- `profiles_select_own`: SELECT where `auth.uid() = id`
- `profiles_update_own`: UPDATE where `auth.uid() = id` (both USING and WITH CHECK)

Functions:
- `public.set_updated_at()` — reusable trigger function; sets `NEW.updated_at = now()`. Downstream tables (goals, payments) reuse this.
- `public.handle_new_user()` — `SECURITY DEFINER` function; inserts a row into `profiles` with `NEW.id` from the triggering `auth.users` insert.

Triggers:
- `on_auth_user_created` — AFTER INSERT on `auth.users`, executes `handle_new_user()`.
- `set_profiles_updated_at` — BEFORE UPDATE on `profiles`, executes `set_updated_at()`.

No INSERT or DELETE policy for regular users — the trigger handles creation (via SECURITY DEFINER, bypassing RLS), and profile deletion cascades from `auth.users`.

#### 3. Seed file

**File**: `supabase/seed.sql` (new file)

**Intent**: Provide a test user with a populated profile for local development. Runs on `supabase db reset`.

**Contract**: Inserts one row into `auth.users` with a well-known UUID (`00000000-0000-0000-0000-000000000001`) and email `test@saved.local`, then updates the auto-created `profiles` row with sample data (display_name, date_of_birth, relationship_status). Wrapped in a transaction. Only for local dev — never runs in production.

#### 4. TypeScript database types

**File**: `src/types/database.ts` (new file)

**Intent**: Provide TypeScript types matching the Supabase schema so application code gets type safety when querying `profiles`.

**Contract**: Generated via `npx supabase gen types typescript --local > src/types/database.ts`. Exports the `Database` type interface. If generation fails (e.g., local Supabase not running), write a manual type matching the `profiles` table schema as a fallback.

#### 5. Supabase client typing

**File**: `src/lib/supabase.ts`

**Intent**: Pass the `Database` generic to `createServerClient` so all queries are type-safe.

**Contract**: Import `Database` from `@/types/database` and use `createServerClient<Database>(...)` instead of the untyped call.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset` exits 0
- TypeScript types are valid: `npx astro sync && npm run lint` passes
- Seed data present: after reset, `profiles` table contains one row for the test user

#### Manual Verification:

- In Supabase Studio (localhost:54323), confirm `profiles` table exists with correct columns
- Create a second user via signup form; verify a profile row is auto-created (trigger works)
- Confirm RLS: query `profiles` as user A — only user A's row is returned

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: RLS Verification + Documentation

### Overview

Verify RLS isolation with concrete SQL queries against local Supabase, ensuring the policies actually enforce per-user data access. Document the RLS pattern inline in the migration for downstream slices to follow.

### Changes Required:

#### 1. RLS verification script

**File**: `supabase/tests/rls-profiles.sql` (new file)

**Intent**: A runnable SQL script that verifies RLS policies work correctly — can be re-run after any migration change to confirm isolation holds.

**Contract**: Uses `SET ROLE` to simulate authenticated users, attempts cross-user SELECT and UPDATE, asserts zero rows returned. Comments explain the pattern so S-02/S-03 authors can adapt it for their tables.

#### 2. Migration inline documentation

**File**: `supabase/migrations/20260610120000_create_profiles.sql` (update)

**Intent**: Add concise comments at key points in the migration that serve as a pattern guide for downstream slices.

**Contract**: Comments above the RLS policy block and trigger block explaining the pattern: "Downstream tables: copy this block, replace table/column names." One line each, not a documentation wall.

### Success Criteria:

#### Automated Verification:

- RLS test script runs without errors: `psql` against local Supabase executes the script and all assertions pass
- Build still passes: `npm run build` exits 0

#### Manual Verification:

- Review the RLS test output and confirm cross-user access returns zero rows
- Read the inline migration comments and confirm they're clear enough for copy-paste by S-02

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- No application-level unit tests needed — this slice is pure SQL + type generation.

### Integration Tests:

- RLS verification script (`supabase/tests/rls-profiles.sql`) is the integration test for this slice.
- Migration applies and rolls back cleanly: `npx supabase db reset` is idempotent.

### Manual Testing Steps:

1. Run `npx supabase start` → verify all services come up
2. Run `npx supabase db reset` → verify migration + seed apply cleanly
3. Open Supabase Studio (localhost:54323) → verify `profiles` table schema
4. Sign up a new user via the app → verify trigger creates a profile row
5. Run the RLS test script → verify cross-user isolation

## Performance Considerations

None for this slice. The `profiles` table is read/written once per session at most. The `auth.users` trigger fires once per signup. No indexing beyond the PK is needed at this scale.

## Migration Notes

- **Forward-only**: Supabase migrations are forward-only in production. No `DOWN` migration needed for MVP.
- **Seed is local-only**: `seed.sql` runs on `supabase db reset` (local) and must never be applied to production.
- **Timestamp in filename**: `20260610120000` — adjust if another migration is created on the same day.

## References

- Roadmap: `context/foundation/roadmap.md` — F-01 definition (lines 60-71)
- PRD: `context/foundation/prd.md` — FR-002, FR-003 (profile fields), NFR (data isolation)
- Supabase client: `src/lib/supabase.ts` — factory function to receive `Database` generic
- Middleware: `src/middleware.ts:11` — `getUser()` call that provides the `auth.uid()` used in RLS
- Supabase config: `supabase/config.toml:55-65` — migration and seed configuration

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration Infrastructure + Profiles Schema

#### Automated

- [x] 1.1 Migration applies cleanly (`npx supabase db reset` exits 0) — 1f3cf24
- [x] 1.2 TypeScript types are valid (`npx astro sync && npm run lint` passes) — 1f3cf24
- [x] 1.3 Seed data present (profiles table contains test user row after reset) — 1f3cf24

#### Manual

- [x] 1.4 Supabase Studio shows profiles table with correct columns — 1f3cf24
- [x] 1.5 New signup auto-creates profile row (trigger works) — 1f3cf24
- [x] 1.6 RLS confirmed: user query returns only own profile — 1f3cf24

### Phase 2: RLS Verification + Documentation

#### Automated

- [x] 2.1 RLS test script runs without errors
- [x] 2.2 Build passes (`npm run build` exits 0)

#### Manual

- [x] 2.3 RLS test output confirms cross-user access returns zero rows
- [x] 2.4 Inline migration comments are clear for downstream copy-paste
