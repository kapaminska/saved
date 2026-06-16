<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth, Onboarding & Profile

- **Plan**: context/changes/auth-onboarding-profile/plan.md
- **Scope**: Full plan (Phase 1–3)
- **Date**: 2026-06-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — OTP input missing mobile keyboard attributes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/auth/MagicLinkForm.tsx
- **Detail**: Plan specifies maxLength={6}, inputMode="numeric", pattern="[0-9]*" on the OTP input for mobile UX. The FormField component doesn't forward these attributes. Digit enforcement is handled client-side via onChange handler, but mobile users see a full QWERTY keyboard instead of a numpad.
- **Fix**: Add inputProps spread to the OTP FormField usage or render a raw `<input>` with the correct attributes for the OTP step.
- **Decision**: FIXED — Added inputProps spread to FormField, applied maxLength/inputMode/pattern/autoComplete on OTP input.

### F2 — SubmitButton never disables during fetch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/auth/SubmitButton.tsx:12
- **Detail**: SubmitButton uses useFormStatus() which only returns pending=true with React Server Actions. Both MagicLinkForm and ProfileForm use manual fetch() in onSubmit handlers, so pending is always false. The button is never disabled during submission, allowing double-clicks to send duplicate OTP emails or duplicate profile saves.
- **Fix A ⭐ Recommended**: Pass loading state as a disabled prop
  - Strength: Minimal change — each form already tracks `loading` state. Add `disabled` prop to SubmitButton or pass it through the existing Button's disabled prop.
  - Tradeoff: Slight API change to SubmitButton.
  - Confidence: HIGH — loading state already exists in both callers.
  - Blind spot: None significant.
- **Fix B**: Replace SubmitButton with inline Button in fetch-based forms
  - Strength: No shared component change; each form controls its own button directly.
  - Tradeoff: Duplicates button markup across forms; loses the pending-text/spinner pattern.
  - Confidence: HIGH — straightforward.
  - Blind spot: Future forms would need to repeat the pattern.
- **Decision**: FIXED via Fix A — Added disabled prop to SubmitButton, passed loading from MagicLinkForm and ProfileForm.

### F3 — skip.ts ignores database update error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/profile/skip.ts:15-17
- **Detail**: The skip endpoint sets display_name to the email prefix but ignores the Supabase update result. If the DB write fails, the user is redirected to /dashboard anyway, but the middleware will detect display_name is still null and redirect back to /onboarding — creating a confusing redirect loop.
- **Fix**: Check the update error and return a 500 response with an error message instead of silently redirecting.
- **Decision**: FIXED — Added error check on Supabase update, returns 500 JSON on failure.

### F4 — No server-side email validation on send-otp

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/send-otp.ts:23
- **Detail**: The endpoint trims the email but performs no format validation before calling supabase.auth.signInWithOtp(). Direct API callers (curl, bots) can send malformed or arbitrarily long strings. Supabase rejects bad emails, but a server-side gate reduces unnecessary round-trips and attack surface.
- **Fix**: Add a simple email format regex check and length limit before the Supabase call (mirror the client-side validateEmail pattern).
- **Decision**: FIXED — Added email format regex and 254-char length check before Supabase call.

### F5 — date_of_birth not validated server-side

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/profile.ts:29
- **Detail**: date_of_birth is accepted as a raw string and passed to the DB without format validation. Postgres rejects invalid dates, but the resulting Supabase error message leaks internal DB error text to the client. No range check prevents future or unreasonable dates (e.g., year 3000).
- **Fix**: Validate date_of_birth matches YYYY-MM-DD format and is within a sane range (1900–today) before the DB call.
- **Decision**: FIXED — Added YYYY-MM-DD format + range (1900–today) validation. Also replaced raw DB error message with generic "Failed to save profile".

### F6 — skip.ts returns redirect on auth failure instead of 401

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/profile/skip.ts:4
- **Detail**: The sibling endpoint profile.ts returns a 401 JSON response for unauthenticated requests. skip.ts returns a redirect to /auth/signin instead. Inconsistent error handling pattern across API endpoints in the same feature.
- **Fix**: Return a 401 JSON response consistent with profile.ts.
- **Decision**: PENDING

### F7 — No server-side rate limiting on OTP send

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/send-otp.ts
- **Detail**: The 60-second client-side cooldown is bypassable. A bot can call the endpoint in a loop for any target email. Supabase has its own project-level rate limits (configured in config.toml), but relying solely on that is an implicit dependency worth documenting.
- **Fix**: Document Supabase rate-limit dependency or add edge rate-limiting (Cloudflare rate-limiting rule or KV-backed counter).
- **Decision**: PENDING

### F8 — Middleware onboarding exemption is prefix-based

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:6
- **Detail**: ONBOARDING_EXEMPT uses startsWith("/api/profile") which exempts all future sub-routes under /api/profile/ from the onboarding gate, even if they should require a completed profile.
- **Fix**: Switch to exact-match list or document the design decision.
- **Decision**: PENDING

### F9 — setTimeout in ProfileForm can fire after unmount

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/profile/ProfileForm.tsx:91
- **Detail**: The 3-second success auto-dismiss uses a bare setTimeout in the submit handler. If the user navigates away before it fires, it calls setSuccess on an unmounted component. Not an error in React 18+ but a minor resource leak.
- **Fix**: Store the timeout ID and clear it on unmount via useEffect cleanup.
- **Decision**: PENDING

### F10 — verify-otp silently swallows profile query error

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/verify-otp.ts:41
- **Detail**: After successful OTP verification, the profile query for redirect determination discards any error. A DB error (timeout, RLS change) looks identical to "no profile" — user goes to onboarding either way. Correct fallback behavior, but masks operational issues.
- **Fix**: Log the error via console.error so it surfaces in Cloudflare Workers logs.
- **Decision**: PENDING
