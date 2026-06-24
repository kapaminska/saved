# Auth, Onboarding & Profile — Plan Brief

> Full plan: `context/changes/auth-onboarding-profile/plan.md`

## What & Why

Switch authentication from email+password to magic link (email OTP), add a first-login onboarding flow, and build a profile editing page. This delivers PRD requirements FR-001–FR-004, FR-028–FR-029, FR-031 — the user identity surface that every other slice depends on for personalization (display name in UI, profile data for projections).

## Starting Point

Auth works with email+password via three API endpoints (`signin`, `signup`, `signout`) and corresponding pages. The `profiles` table exists from F-01 with RLS, auto-creation trigger, and TypeScript types — but no UI consumes profile data. The dashboard is a placeholder showing email + signout. Supabase config already has OTP settings (6-digit, 1-hour expiry) but the app code doesn't use them.

## Desired End State

User enters email on `/auth/signin`, receives a 6-digit code, types it, and is authenticated. First-time users land on `/onboarding` to fill in name + optional profile fields (or skip). Returning users go straight to `/dashboard`. A `/profile` page lets users edit their data anytime. The Topbar shows display name + profile link on all authenticated pages. No password-based auth exists.

## Key Decisions Made

| Decision                  | Choice                                   | Why (1 sentence)                                                                    |
| ------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Auth mechanism            | Email OTP (6-digit code)                 | No tab-switching; works reliably on all devices including mobile.                   |
| Signup/signin unification | Single `/auth/signin` page               | Magic link erases the signup/signin distinction — one flow handles both (FR-031).   |
| Onboarding trigger        | `display_name IS NULL` check             | Simple, reliable heuristic — no extra DB column; nudges users to set a name.        |
| Onboarding structure      | Single page, all fields                  | Only 4 fields total — a wizard would over-engineer it.                              |
| Navigation                | Extend Topbar with profile link          | Builds on existing component; sidebar is premature with only 2 authenticated pages. |
| Profile page              | Separate `/profile` route                | Clean separation from dashboard; matches FR-028 ("dedicated profile page").         |
| OTP error handling        | Inline errors + resend with 60s cooldown | Standard pattern; user stays on the same page.                                      |

## Scope

**In scope:**

- Magic link OTP auth (send, verify, resend with cooldown)
- Remove all password-based auth code and signup page
- Onboarding page with name (required feel) + optional fields (DOB, retirement age, relationship status)
- Skip onboarding option (sets display_name to email prefix)
- Profile edit page with same fields
- Middleware onboarding redirect for new users
- Topbar: display name + profile link
- Dashboard: welcome with display name

**Out of scope:**

- OAuth / social login
- Email template customization
- Production SMTP setup
- Sidebar or complex navigation
- Unit/integration test framework setup

## Architecture / Approach

Two-step React island on `/auth/signin` handles the OTP flow client-side (email step → OTP step with resend timer), calling server-side API endpoints (`/api/auth/send-otp`, `/api/auth/verify-otp`) that hold Supabase credentials. A shared `ProfileForm` React component serves both `/onboarding` and `/profile` pages. Middleware queries the profiles table on protected routes to detect onboarding state and populates `Astro.locals.profile` for downstream pages.

## Phases at a Glance

| Phase                        | What it delivers                                | Key risk                                                              |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| 1. Auth flow overhaul        | Magic link OTP login, password auth removed     | OTP email delivery in local dev depends on Inbucket working correctly |
| 2. Onboarding flow           | First-login detection + profile collection page | Middleware redirect logic must avoid loops on exempt paths            |
| 3. Profile page & navigation | Profile editing + Topbar improvements           | Low risk — builds on Phase 2 components                               |

**Prerequisites:** F-01 complete (profiles table + RLS + trigger) ✓
**Estimated effort:** ~3 sessions across 3 phases

## Open Risks & Assumptions

- Inbucket (local email catcher) must be running for OTP emails — `npx supabase start` handles this
- Middleware profile query adds one DB call per protected-route request — acceptable at MVP scale
- Supabase `signInWithOtp` auto-creates accounts for new emails — no separate signup logic needed (verified in Supabase docs for `@supabase/supabase-js@^2.99.1`)

## Success Criteria (Summary)

- User can sign in with email OTP end-to-end (no password anywhere)
- First-time user sees onboarding; returning user skips it
- Profile data persists and displays correctly in Topbar and dashboard
