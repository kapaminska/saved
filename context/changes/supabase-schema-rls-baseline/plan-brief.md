# Supabase Migrations + RLS Baseline — Plan Brief

> Full plan: `context/changes/supabase-schema-rls-baseline/plan.md`

## What & Why

Enable Supabase migration tooling and create the `profiles` table with row-level security — the database foundation that every downstream slice depends on. Without this, S-01 (auth/onboarding), S-02 (goals), and S-03 (payments) have no schema to build on and no RLS pattern to follow.

## Starting Point

Supabase CLI is installed but never used for migrations — no `supabase/migrations/` directory, no application tables, no seed data. Auth works (cookie-based SSR sessions via `@supabase/ssr`), but the only user data comes from `auth.users`. The `profiles` table referenced by the PRD (FR-002, FR-003) doesn't exist yet.

## Desired End State

Running `npx supabase db reset` locally creates the `profiles` table with all PRD-specified columns, enforces RLS (each user sees only their own row), auto-creates a profile on signup via a DB trigger, and seeds a test user. TypeScript database types are generated and wired into the Supabase client for type-safe queries. The migration file doubles as a documented pattern for downstream slices.

## Key Decisions Made

| Decision                    | Choice                          | Why (1 sentence)                                                                 |
|-----------------------------|---------------------------------|----------------------------------------------------------------------------------|
| Profile columns             | Full PRD set (name, DOB, retirement_age, relationship_status) | S-01 only needs UI work, not another migration.                     |
| Table scope                 | Profiles only                   | Each slice owns its schema — clean ownership, easier review.                     |
| Profile creation mechanism  | DB trigger on auth.users insert | Guarantees every auth user has a profile — no orphan states or race conditions.  |
| Seed data                   | Yes, minimal (1 test user)      | Proves the full local flow and gives downstream slices something to test against.|

## Scope

**In scope:**
- Migration directory + migration file (profiles table, RLS policies, triggers)
- Seed file for local development
- TypeScript database type generation
- Supabase client typing (`Database` generic)
- RLS verification script
- Inline pattern documentation for downstream slices

**Out of scope:**
- Goals/payments tables (S-02, S-03)
- Magic link auth migration (S-01)
- Profile UI or API endpoints (S-01)
- Production Supabase setup
- Observability

## Architecture / Approach

Single SQL migration file creates the `profiles` table with a FK to `auth.users`, enables RLS with SELECT/UPDATE policies scoped to `auth.uid() = id`, and wires two triggers: one to auto-create profile rows on signup (`SECURITY DEFINER`), one to auto-update `updated_at`. The `set_updated_at()` function is reusable by downstream tables. TypeScript types are generated from the local schema via `supabase gen types`.

## Phases at a Glance

| Phase     | What it delivers                              | Key risk                                              |
|-----------|-----------------------------------------------|-------------------------------------------------------|
| 1. Schema | Migration + seed + TS types + client typing   | Migration tooling untested in this project — may need config fixes |
| 2. Verify | RLS test script + inline pattern docs         | RLS test requires local Supabase running (Docker)     |

**Prerequisites:** Docker running (for `npx supabase start`), Supabase env vars in `.dev.vars`
**Estimated effort:** ~1 session, 2 phases

## Open Risks & Assumptions

- Migration tooling hasn't been tested in this project — `supabase db reset` may surface config issues on first run.
- Seed file inserts directly into `auth.users`, which depends on local Supabase's internal schema staying stable across CLI versions.
- `retirement_age` CHECK constraint (30–100) is a reasonable default; may need adjustment if user feedback surfaces edge cases.

## Success Criteria (Summary)

- `npx supabase db reset` applies migration + seed cleanly (exit 0)
- New user signup auto-creates a profile row via trigger
- RLS verified: user A cannot access user B's profile data
