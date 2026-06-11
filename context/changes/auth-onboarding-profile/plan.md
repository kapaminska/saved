# Auth, Onboarding & Profile Implementation Plan

## Overview

Switch authentication from email+password to magic link (email OTP), add a first-login onboarding flow that collects the user's name and optional profile data, and build a dedicated profile editing page. Covers PRD requirements FR-001–FR-004, FR-028–FR-029, FR-031.

## Current State Analysis

Authentication uses email+password via `signInWithPassword` / `signUp` endpoints. The `profiles` table exists (F-01) with `display_name`, `date_of_birth`, `retirement_age`, `relationship_status` columns and RLS policies. A `handle_new_user()` trigger auto-creates a profile row on signup. No onboarding flow or profile page exists — the dashboard is a placeholder showing email and a signout button.

### Key Discoveries:

- Auth endpoints at `src/pages/api/auth/{signin,signup,signout}.ts` all use password-based Supabase calls — `signin.ts:13` calls `signInWithPassword`, `signup.ts:13` calls `signUp` with password
- Profile auto-creation trigger exists in `supabase/migrations/20260610120000_create_profiles.sql:37-50` — fires on `auth.users` INSERT, creates row with `new.id`
- Supabase config already has OTP settings: 6-digit code, 1-hour expiry, rate limits configured (`supabase/config.toml:202-217`)
- `@supabase/supabase-js@^2.99.1` and `@supabase/ssr@^0.10.3` both support `signInWithOtp()` and `verifyOtp()`
- Database types at `src/types/database.ts` already include the full `profiles` table typing
- Only one shadcn/ui component installed (Button) — new components needed for forms
- Existing `FormField` component at `src/components/auth/FormField.tsx` provides the input pattern (icon, error, hint slots)
- `Topbar.astro` already handles auth-aware navigation — shows email + signout when logged in

## Desired End State

A user enters their email on `/auth/signin`, receives a 6-digit OTP, types it in, and is authenticated. On first login (profile `display_name` is null), they're redirected to `/onboarding` where they can fill in their name and optional profile fields, or skip. On subsequent logins, they go straight to `/dashboard`. From any authenticated page, they can access `/profile` to edit their data, and sign out via the Topbar. No password-based auth exists anywhere.

**Verification:** Sign out → enter email → receive OTP in Inbucket → type code → land on onboarding (first time) or dashboard (returning) → navigate to /profile → edit fields → save → Topbar shows display name.

## What We're NOT Doing

- OAuth / social login — magic link only (FR-001)
- Password-based auth retention — fully removed
- Sidebar or complex navigation layout — extend Topbar only
- Onboarding wizard / multi-step flow — single page with all fields
- Email template customization — use Supabase defaults (Inbucket for local dev)
- Production SMTP setup — that's a deploy concern, not code

## Implementation Approach

Three phases in dependency order: (1) auth overhaul replaces the login mechanism, (2) onboarding adds the first-login flow on top of the new auth, (3) profile page and navigation polish complete the user identity surface. Each phase is independently testable.

The OTP flow uses a two-step React island on `/auth/signin`: email input → OTP input with resend. Server-side API endpoints handle `signInWithOtp` and `verifyOtp` calls (Supabase keys are server-only). The onboarding and profile pages share a `ProfileForm` React component, differing only in wrapper text and submit behavior.

## Critical Implementation Details

### Timing & lifecycle

The middleware onboarding redirect must exclude `/onboarding`, `/api/profile`, and `/api/auth/signout` paths — otherwise the user gets stuck in an infinite redirect loop or can't save their profile. The check order is: (1) resolve user, (2) protect routes, (3) if authenticated and on a protected route that isn't onboarding-exempt, check `display_name` via a Supabase query and redirect if null.

---

## Phase 1: Auth Flow Overhaul (Magic Link OTP)

### Overview

Replace password-based authentication with email OTP. Create new API endpoints for sending and verifying OTP codes. Build a two-step signin UI. Remove all password-related code and the separate signup flow.

### Changes Required:

#### 1. Install shadcn/ui components

**Intent**: Add Input and Label components needed for the new auth forms and all subsequent phases.

**Contract**: Run `npx shadcn@latest add input label` — installs to `src/components/ui/input.tsx` and `src/components/ui/label.tsx`.

#### 2. OTP send endpoint

**File**: `src/pages/api/auth/send-otp.ts` (new)

**Intent**: Accept an email via POST, call `supabase.auth.signInWithOtp({ email })`, return a JSON response indicating success or error. This replaces both the old signin and signup endpoints — magic link auto-creates accounts on first use (FR-031).

**Contract**: `POST` export. Accepts `{ email: string }` from form data. Returns `Response` with JSON `{ success: boolean, error?: string }`. Uses the existing `createClient` factory from `@/lib/supabase`.

#### 3. OTP verify endpoint

**File**: `src/pages/api/auth/verify-otp.ts` (new)

**Intent**: Accept email + OTP token via POST, call `supabase.auth.verifyOtp({ email, token, type: 'email' })`, return JSON with redirect URL. After verification, query the user's profile to determine redirect destination: `/onboarding` if `display_name` is null, `/dashboard` otherwise.

**Contract**: `POST` export. Accepts `{ email: string, token: string }` from form data. Returns JSON `{ success: boolean, redirect: string, error?: string }`. The profile check uses `supabase.from('profiles').select('display_name').eq('id', user.id).single()`.

#### 4. Magic link signin form

**File**: `src/components/auth/MagicLinkForm.tsx` (new)

**Intent**: Two-step React island for the signin page. Step 1: email input with submit → calls `/api/auth/send-otp` via fetch. Step 2: 6-digit OTP input with submit → calls `/api/auth/verify-otp` via fetch, then `window.location.href = redirect`. Includes a "Resend code" button with 60-second cooldown timer, and inline error display for invalid/expired codes.

**Contract**: Props `{ serverError?: string | null }`. Uses `useState` for step tracking (`'email' | 'otp'`), email value, token value, errors, cooldown timer. Reuses existing `FormField` for email input, `SubmitButton` for submit buttons, `ServerError` for error display. OTP input uses a simple text input with `maxLength={6}`, `inputMode="numeric"`, `pattern="[0-9]*"` for mobile keyboard. Fetch calls use `Content-Type: application/x-www-form-urlencoded` to match the form data pattern used by API endpoints.

#### 5. Update signin page

**File**: `src/pages/auth/signin.astro`

**Intent**: Replace `SignInForm` with the new `MagicLinkForm` component. Update heading text. Remove the "Don't have an account?" link since signup is unified.

**Contract**: Import `MagicLinkForm` instead of `SignInForm`. Keep the existing Layout wrapper and cosmic styling. `client:load` directive on the React island.

#### 6. Remove password-based auth artifacts

**Files**:
- `src/pages/auth/signup.astro` — delete
- `src/pages/auth/confirm-email.astro` — delete
- `src/pages/api/auth/signin.ts` — delete (replaced by send-otp + verify-otp)
- `src/pages/api/auth/signup.ts` — delete
- `src/components/auth/SignInForm.tsx` — delete
- `src/components/auth/SignUpForm.tsx` — delete
- `src/components/auth/PasswordToggle.tsx` — delete

**Intent**: Clean up all password-based auth code. The old `signin.ts` endpoint is replaced by the new `send-otp.ts` + `verify-otp.ts` pair. The signup page is unnecessary because magic link auto-creates accounts.

**Contract**: Files removed from disk. No other files import these — `SignInForm` was only used in `signin.astro` (now replaced), `SignUpForm` only in `signup.astro` (deleted), `PasswordToggle` only in the two form components (deleted).

#### 7. Update Topbar signin/signup links

**File**: `src/components/Topbar.astro`

**Intent**: The unauthenticated state currently shows both "Sign in" and "Sign up" links. Since signup is unified into signin, show only a single "Sign in" link.

**Contract**: Remove the "Sign up" `<a>` tag from the unauthenticated branch. Keep the "Sign in" link pointing to `/auth/signin`.

#### 8. Update landing page links

**File**: `src/components/Welcome.astro`

**Intent**: Check if the landing page hero has signup/signin links and update them to point only to `/auth/signin`.

**Contract**: Replace any `/auth/signup` href with `/auth/signin`. If both links exist, consolidate to a single CTA.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- No TypeScript errors: `npx astro sync && npx tsc --noEmit`
- Old auth pages return 404: `/auth/signup`, `/auth/confirm-email`
- Old API endpoints return 404/405: `POST /api/auth/signin`, `POST /api/auth/signup`

#### Manual Verification:

- Navigate to `/auth/signin` → see email input form (no password field)
- Enter email → click submit → OTP sent (check Inbucket at `localhost:54324`)
- Enter correct OTP → authenticated, redirected to `/dashboard`
- Enter wrong OTP → inline error message, stays on OTP step
- Wait 60s cooldown → "Resend code" button becomes active
- Click resend → new OTP email in Inbucket
- New email (first login) → auto-creates account and profile
- Existing user → logs in without creating duplicate
- Topbar shows only "Sign in" link when unauthenticated
- Sign out → back to landing page, unauthenticated

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Onboarding Flow

### Overview

Add a first-login onboarding page that detects new users (profile `display_name` is null) and collects their name and optional profile data. Build a shared ProfileForm component and a profile save API endpoint.

### Changes Required:

#### 1. Profile save endpoint

**File**: `src/pages/api/profile.ts` (new)

**Intent**: Accept profile field values via POST, update the authenticated user's profile row in the `profiles` table. Used by both the onboarding page and the profile edit page (Phase 3).

**Contract**: `POST` export. Accepts form data with fields: `display_name` (string, required, trimmed), `date_of_birth` (string, optional, ISO date), `retirement_age` (string, optional, parsed to integer 30–100), `relationship_status` (string, optional, one of `'single' | 'married' | 'partnership' | ''`). Validates inputs server-side. Gets user from `context.locals.user`. Calls `supabase.from('profiles').update({...}).eq('id', user.id)`. Returns JSON `{ success: boolean, error?: string }`. Rejects unauthenticated requests with 401.

#### 2. ProfileForm component

**File**: `src/components/profile/ProfileForm.tsx` (new)

**Intent**: Shared React form component used by both the onboarding page and the profile page. Displays fields for display name, date of birth, retirement age, and relationship status. Submits to `/api/profile` via fetch.

**Contract**: Props `{ profile: { display_name: string | null; date_of_birth: string | null; retirement_age: number | null; relationship_status: string | null }; onSuccess?: () => void; submitLabel?: string }`. Uses existing `FormField` for text/date/number inputs. Relationship status uses a styled `<select>` element matching the FormField visual pattern. Client-side validation: display_name required and trimmed non-empty, retirement_age 30–100 if provided. On successful save, calls `onSuccess` callback (onboarding uses it to redirect to `/dashboard`; profile page uses it to show success feedback).

#### 3. Onboarding page

**File**: `src/pages/onboarding.astro` (new)

**Intent**: Protected page shown to first-time users. Displays a welcome message and the ProfileForm pre-populated with empty/null values. A "Skip" link allows users to go directly to the dashboard without filling in any fields (but sets `display_name` to their email prefix as a fallback to prevent re-triggering onboarding).

**Contract**: Uses `Layout` component. Reads `Astro.locals.user` for email. Fetches profile data from Supabase to pre-populate form. Renders `ProfileForm` with `client:load` and `submitLabel="Continue"`. Includes a "Skip for now" link that POSTs to a `/api/profile/skip` endpoint (or inline sets `display_name` to email prefix). Cosmic styling consistent with auth pages.

#### 4. Skip onboarding endpoint

**File**: `src/pages/api/profile/skip.ts` (new)

**Intent**: Sets `display_name` to the user's email prefix (part before @) so the onboarding check doesn't re-trigger, then redirects to `/dashboard`.

**Contract**: `POST` export. Gets user from `context.locals.user`. Extracts email prefix. Updates `profiles.display_name` where `id = user.id`. Redirects to `/dashboard`.

#### 5. Middleware: onboarding redirect

**File**: `src/middleware.ts`

**Intent**: After authenticating a user on protected routes, check if their profile needs onboarding. If `display_name` is null and the user isn't already on an exempt path (`/onboarding`, `/api/profile`, `/api/auth/signout`), redirect to `/onboarding`.

**Contract**: Add `/onboarding` and `/profile` to `PROTECTED_ROUTES`. After the existing auth check, for authenticated users on protected routes, query `supabase.from('profiles').select('display_name').eq('id', user.id).single()`. If `display_name` is null and `pathname` is not in the exempt list (`/onboarding`, `/api/profile`, `/api/auth/signout`), return `context.redirect('/onboarding')`. Store the profile data on `context.locals` for downstream use (avoids re-fetching in pages).

#### 6. Extend App.Locals type

**File**: `src/env.d.ts`

**Intent**: Add the profile data to `App.Locals` so pages can access it without re-querying the database.

**Contract**: Add `profile: import("@/types/database").Database['public']['Tables']['profiles']['Row'] | null` to the `Locals` interface.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- No TypeScript errors: `npx astro sync && npx tsc --noEmit`
- `/onboarding` route exists and is protected (unauthenticated → redirect to signin)

#### Manual Verification:

- New user: sign in with OTP → redirected to `/onboarding` (not dashboard)
- Onboarding page shows name field (prominent) + optional fields (DOB, retirement age, relationship status)
- Fill in name + some optional fields → submit → redirected to `/dashboard`
- Sign out and sign in again → goes straight to `/dashboard` (not onboarding)
- New user: sign in → click "Skip for now" → redirected to `/dashboard`, display_name set to email prefix
- Sign in again after skip → goes to `/dashboard` (onboarding doesn't re-trigger)
- Cannot access `/dashboard` without completing/skipping onboarding (redirect loop doesn't happen)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Profile Page & Navigation

### Overview

Build a dedicated `/profile` page for editing profile data, and update the Topbar to show the user's display name and a link to the profile page.

### Changes Required:

#### 1. Profile page

**File**: `src/pages/profile.astro` (new)

**Intent**: Protected page where authenticated users can view and edit all their profile fields (FR-028). Reuses the `ProfileForm` component from Phase 2.

**Contract**: Uses `Layout` component. Reads profile from `Astro.locals.profile` (populated by middleware in Phase 2). Renders `ProfileForm` with `client:load`, pre-populated with current profile data, `submitLabel="Save changes"`. `onSuccess` shows a success message (e.g., brief "Saved!" text). Page heading: "Your profile". Cosmic styling consistent with other authenticated pages.

#### 2. Update Topbar with profile link and display name

**File**: `src/components/Topbar.astro`

**Intent**: When authenticated, show the user's display name (instead of just email) and add a "Profile" link. Fulfills FR-029 (sign out from any page — already works) and improves navigation.

**Contract**: Read `Astro.locals.profile` for `display_name`. Authenticated state shows: `display_name ?? user.email` on the left, then "Dashboard", "Profile", "Sign out" links on the right. The "Profile" link points to `/profile`.

#### 3. Update dashboard to use profile data

**File**: `src/pages/dashboard.astro`

**Intent**: Show the user's display name in the welcome message instead of just email. Remove the inline signout button (Topbar handles it).

**Contract**: Read `Astro.locals.profile`. Display "Welcome, {profile.display_name ?? user.email}". Include `Topbar` component at the top. Remove the standalone signout form — Topbar provides it.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- No TypeScript errors: `npx astro sync && npx tsc --noEmit`
- `/profile` route exists and is protected

#### Manual Verification:

- Navigate to `/profile` → see form with current profile data pre-populated
- Edit display name → save → success feedback shown, Topbar updates to new name
- Edit optional fields (DOB, retirement age, relationship status) → save → fields persist on page reload
- Clear optional fields → save → fields show as empty (nullable)
- Topbar shows display name (not email) when display_name is set
- Topbar shows email when display_name is null/empty
- "Profile" link in Topbar navigates to `/profile`
- "Dashboard" link navigates to `/dashboard`
- "Sign out" works from both `/profile` and `/dashboard`
- Dashboard shows "Welcome, {display_name}" instead of email

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- No unit test framework is currently configured — testing is manual for MVP (3-week timeline)

### Integration Tests:

- RLS verification script (`supabase/tests/rls-profiles.sql`) validates profile data isolation
- Profile update respects RLS — user can only update their own row

### Manual Testing Steps:

1. Full auth flow: landing → signin → OTP → dashboard (existing user) or onboarding (new user)
2. Onboarding: fill fields → continue → dashboard shows name; skip → dashboard shows email prefix
3. Profile edit: change name → save → Topbar updates; change optional fields → save → persist on reload
4. Auth edge cases: wrong OTP → error; expired OTP → error + resend; multiple rapid submits → rate limited
5. Route protection: unauthenticated → `/dashboard` redirects to signin; unauthenticated → `/profile` redirects to signin
6. Onboarding guard: new user → `/dashboard` redirects to onboarding; completed user → `/dashboard` works normally

## Performance Considerations

- Middleware profile query adds one DB call per protected-route request. Acceptable for MVP scale (small user count). If performance becomes a concern, profile data could be cached in cookies or session.
- OTP verification is a single Supabase auth call — latency dominated by Supabase, not app code.

## Migration Notes

- No database migrations needed — profiles table already exists from F-01
- Existing test user in seed.sql (`test@saved.local`) already has `display_name: "Test User"` — will bypass onboarding as expected
- Users who signed up with password auth can still sign in via magic link — Supabase handles the transition transparently (same email = same account)

## References

- F-01 plan: `context/changes/supabase-schema-rls-baseline/plan.md`
- PRD: `context/foundation/prd.md` (FR-001–FR-004, FR-028–FR-029, FR-031)
- Roadmap: `context/foundation/roadmap.md` (S-01)
- Supabase OTP config: `supabase/config.toml:202-217`
- Profiles migration: `supabase/migrations/20260610120000_create_profiles.sql`
- Database types: `src/types/database.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth flow overhaul

#### Automated

- [x] 1.1 Build passes after auth changes
- [x] 1.2 Lint passes
- [x] 1.3 No TypeScript errors
- [x] 1.4 Old auth pages return 404
- [x] 1.5 Old API endpoints return 404/405

#### Manual

- [ ] 1.6 Signin page shows email input (no password)
- [ ] 1.7 OTP send + verify flow works end-to-end
- [ ] 1.8 Wrong OTP shows inline error
- [ ] 1.9 Resend button with cooldown works
- [ ] 1.10 New email auto-creates account
- [ ] 1.11 Sign out returns to landing page

### Phase 2: Onboarding flow

#### Automated

- [ ] 2.1 Build passes after onboarding changes
- [ ] 2.2 Lint passes
- [ ] 2.3 No TypeScript errors
- [ ] 2.4 /onboarding route is protected

#### Manual

- [ ] 2.5 New user redirected to onboarding after OTP
- [ ] 2.6 Onboarding form saves profile data
- [ ] 2.7 Returning user skips onboarding
- [ ] 2.8 Skip button sets display_name and redirects
- [ ] 2.9 No redirect loops

### Phase 3: Profile page & navigation

#### Automated

- [ ] 3.1 Build passes after profile changes
- [ ] 3.2 Lint passes
- [ ] 3.3 No TypeScript errors
- [ ] 3.4 /profile route is protected

#### Manual

- [ ] 3.5 Profile page shows pre-populated form
- [ ] 3.6 Profile edits persist on reload
- [ ] 3.7 Topbar shows display name and profile link
- [ ] 3.8 Dashboard shows welcome with display name
- [ ] 3.9 Sign out works from all authenticated pages
