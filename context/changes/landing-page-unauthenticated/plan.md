# Landing Page for Unauthenticated Users — Implementation Plan

## Overview

Replace the Astro starter scaffold at `/` with a product landing page that communicates Saved!'s value proposition in Polish, provides a clear magic-link login path, and redirects authenticated users away from the landing per FR-037 and US-02. Covers roadmap slice S-05 (PRD US-02, FR-037).

## Current State Analysis

The index route (`src/pages/index.astro`) renders `Welcome.astro` — starter-kit marketing copy ("10x Astro Starter") with three generic feature cards about auth/stack/DX. The page uses the cosmic dark theme (`bg-cosmic`, purple CTAs, glass cards) and includes `Topbar.astro` for navigation.

Middleware (`src/middleware.ts`) resolves `context.locals.user` and `context.locals.profile` on every request and protects `/dashboard`, `/onboarding`, `/profile`, and `/goals`. It redirects fully onboarded users away from `/auth/signin` to `/dashboard`, but **`/` is public for all users** — logged-in users can still view the starter landing. This violates FR-037 ("authenticated user lands on dashboard, not landing page").

Auth is unified at `/auth/signin` via magic-link OTP (S-01). Landing CTAs already point to `/auth/signin`. Sign-out returns users to `/`.

### Key Discoveries:

- `src/pages/index.astro:1-8` — thin wrapper around `Welcome.astro` + `Layout.astro`
- `src/components/Welcome.astro:35-45` — starter hero and CTA to `/auth/signin` (link target is correct; copy is wrong)
- `src/middleware.ts:29-31` — existing pattern for auth-aware redirect on `/auth/signin` when `user && profile?.display_name`
- `src/pages/api/auth/verify-otp.ts` — post-login redirect: `/dashboard` if `display_name` set, else `/onboarding`
- `src/styles/global.css:113-116` — `@utility bg-cosmic` is the only page-background utility today; shadcn tokens in `:root` are neutral (not warm)
- No dedicated marketing components exist — all landing content lives in `Welcome.astro`
- `Layout.astro:14` — `<html lang="en">` globally; landing copy will be Polish

## Desired End State

An unauthenticated visitor at `/` sees a warm-toned landing page in Polish with:
- A dedicated marketing header (product name + login CTA)
- Hero headline **"Odkładaj na cele. Świętuj każdy z nich."** with supporting subhead and primary CTA to magic-link sign-in
- Three feature cards covering savings goals, monthly check-in, and progress projection

An authenticated user visiting `/` is redirected immediately:
- Has `display_name` → `/dashboard`
- No `display_name` → `/onboarding`

**Verification:** Sign out → `/` shows Polish landing with warm styling → click "Zaloguj się" → `/auth/signin` → complete OTP → dashboard (returning) or onboarding (new). While signed in, navigating to `/` redirects without showing landing content.

## What We're NOT Doing

- Richer landing sections (how-it-works steps, example check-in sentence, footer) — hero + 3 cards only
- Polish localization of `/auth/signin` or other app pages — landing only
- App-wide warm theme rollout — warm palette applies to landing in this slice; S-06 (`visual-language-polish`) extends tokens to authenticated views
- SEO/meta tag optimization, Open Graph, or analytics instrumentation
- Replacing `Topbar.astro` on authenticated pages — marketing header is landing-only
- Net worth panel, AI demo, or interactive product previews on the landing

## Implementation Approach

Two phases in dependency order: (1) middleware auth routing closes the FR-037 gap with zero UI dependency, (2) landing page replacement delivers content, marketing header, and warm visual theme together. Phase 1 is independently verifiable via redirect behavior before any visual work lands.

Rename/replace `Welcome.astro` with a product-specific landing component. Introduce landing-scoped warm CSS utilities in `global.css` rather than rewriting shadcn theme tokens app-wide — keeps S-06 free to harmonize authenticated views later.

## Critical Implementation Details

### Timing & lifecycle

The `/` redirect in middleware must be placed **after** user and profile resolution (lines 13–25) and **before** the protected-routes block. Use exact pathname match (`pathname === "/"`) — not `startsWith`, to avoid affecting future sub-routes. Mirror the verify-otp redirect rule: `display_name` present → dashboard, absent → onboarding.

---

## Phase 1: Authenticated `/` Redirect

### Overview

Add middleware logic so authenticated users never see the landing page. Unauthenticated users continue to receive `/` normally.

### Changes Required:

#### 1. Root route redirect

**File**: `src/middleware.ts`

**Intent**: When a user with an active session hits `/`, redirect them to the appropriate post-auth destination instead of rendering the landing page.

**Contract**: After profile resolution and before the `PROTECTED_ROUTES` check, add:

- Condition: `pathname === "/" && context.locals.user`
- If `context.locals.profile?.display_name` → `context.redirect("/dashboard")`
- Else → `context.redirect("/onboarding")`

No redirect when `user` is null (unauthenticated visitors see landing).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Signed-out user visiting `/` loads the page (no redirect loop)
- User with session + `display_name` visiting `/` redirects to `/dashboard`
- User with session but no `display_name` visiting `/` redirects to `/onboarding`
- Existing protected-route and `/auth/signin` redirect behavior unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Product Landing Page (Content + Warm Theme)

### Overview

Replace starter landing content with Saved! product messaging in Polish, a dedicated marketing header, three value-prop feature cards, and a warm visual palette scoped to the landing page.

### Changes Required:

#### 1. Warm landing CSS utilities

**File**: `src/styles/global.css`

**Intent**: Add landing-scoped background and surface utilities with a warm palette (cream/amber tones, humanist feel) without altering global shadcn tokens used by authenticated pages.

**Contract**: Add `@utility` entries (or equivalent Tailwind 4 custom utilities) such as:
- `bg-warm` — warm gradient or solid background for the landing page shell (light/cream base, not cosmic dark)
- Optionally `text-warm-*` / border utilities if needed for card surfaces

Keep existing `bg-cosmic` untouched — auth and app pages continue using it until S-06.

#### 2. Marketing header component

**File**: `src/components/MarketingHeader.astro` (new)

**Intent**: Provide landing-only top chrome: product wordmark ("Saved!") on the left and a primary login CTA on the right. No app navigation links (Dashboard, Archive, Profile).

**Contract**: Astro component, no props required. Contains:
- Product name/link to `/`
- `<a href="/auth/signin">` styled as a button or prominent link with label **"Zaloguj się"**

Does not read `Astro.locals.user` — authenticated users never reach the landing (Phase 1 redirect).

#### 3. Landing page component

**File**: `src/components/LandingPage.astro` (new)

**Intent**: Replace starter `Welcome.astro` content with product landing: marketing header, hero, three feature cards. All copy in Polish.

**Contract**: Structure:

**Hero section:**
- `<h1>`: `Odkładaj na cele. Świętuj każdy z nich.`
- Subhead (1–2 sentences): communicates multiple savings goals, monthly check-in (one sentence or manual), and progress projection — derived from PRD vision, not starter copy
- Primary CTA: **"Zaloguj się"** → `/auth/signin`

**Three feature cards** (grid, responsive — mirror current 1-col mobile / 3-col desktop layout from `Welcome.astro`):

| Card | Title (PL) | Body (PL) — covers FR-037 pillar |
|------|------------|----------------------------------|
| 1 | Cele oszczędnościowe | Define multiple goals with target amounts and optional deadlines |
| 2 | Miesięczny check-in | Monthly check-in via one natural-language sentence or manual entry |
| 3 | Projekcja postępu | Required pace, projected completion date, on-track/behind/ahead status |

Use warm landing utilities (`bg-warm`, warm card borders/backgrounds, amber/warm primary CTA). Rounded card surfaces per PRD NFR. Include appropriate lucide or inline SVG icons per card (consistent with existing icon usage in `Welcome.astro`).

Import and render `MarketingHeader` at the top — do **not** import `Topbar`.

#### 4. Wire index route to new landing

**File**: `src/pages/index.astro`

**Intent**: Point the index route at the new landing component.

**Contract**: Replace `import Welcome from "@/components/Welcome.astro"` with `import LandingPage from "@/components/LandingPage.astro"`. Render `<LandingPage />` inside `<Layout>`. Optionally pass `title` prop to Layout if a Polish page title is desired (e.g., `"Saved! — Odkładaj na cele"`).

#### 5. Remove starter landing artifact

**File**: `src/components/Welcome.astro`

**Intent**: Delete the starter scaffold component once `LandingPage.astro` replaces it — no dead code.

**Contract**: File deleted. No remaining imports of `Welcome.astro` (grep confirms only `index.astro` referenced it).

#### 6. Landing page language attribute (optional polish)

**File**: `src/layouts/Layout.astro`

**Intent**: Allow the landing page to declare Polish language for accessibility/SEO without forcing app-wide change.

**Contract**: Add optional prop `lang?: string` (default `"en"`). Apply to `<html lang={lang}>`. Pass `lang="pl"` from `index.astro` only. Other pages keep default `"en"` until a future localization slice.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`
- No imports of deleted `Welcome.astro` remain (verify via grep or build)

#### Manual Verification:

- Signed-out `/` shows Polish hero with chosen slogan and warm (non-cosmic) visual treatment
- Three feature cards communicate goals, check-in, and projection value props
- Marketing header shows "Saved!" and "Zaloguj się" — no app nav links, no Topbar
- Hero and header CTAs navigate to `/auth/signin`
- Page is readable on mobile (responsive grid, no horizontal overflow)
- Authenticated redirect from Phase 1 still works after landing replacement
- Auth/signin and dashboard pages retain cosmic theme (no accidental warm-theme bleed)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the slice complete.

---

## Testing Strategy

### Unit Tests:

- None in this slice — no test framework configured for Astro components. Redirect logic in middleware is verified manually and via build/lint.

### Integration Tests:

- None in this slice.

### Manual Testing Steps:

1. Sign out → visit `/` → confirm Polish landing with warm styling
2. Click hero CTA → lands on `/auth/signin`
3. Click header "Zaloguj się" → lands on `/auth/signin`
4. Sign in as returning user → visit `/` → redirects to `/dashboard`
5. Sign in as new user (no display_name) → visit `/` → redirects to `/onboarding`
6. Resize to mobile width → cards stack, text readable, CTAs tappable
7. Visit `/dashboard` after Phase 2 → confirm cosmic theme unchanged on app pages

## Performance Considerations

Landing is static Astro markup (no React islands). Middleware adds no extra DB calls beyond the existing per-request profile query. Warm CSS utilities are compile-time Tailwind — no runtime cost.

## Migration Notes

No data migration. `Welcome.astro` deletion is a straight component swap. If any external link referenced starter copy, behavior is unchanged (same `/` URL).

## References

- PRD: `context/foundation/prd.md` — US-02, FR-037, Secondary Success Criteria
- Roadmap: `context/foundation/roadmap.md` — S-05
- Auth redirect pattern: `src/middleware.ts:29-31`, `src/pages/api/auth/verify-otp.ts`
- Starter landing (to replace): `src/components/Welcome.astro`
- Related slice (visual identity extension): S-06 `visual-language-polish`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Authenticated `/` Redirect

#### Automated

- [x] 1.1 Linting passes: `npm run lint`
- [x] 1.2 Production build passes: `npm run build`

#### Manual

- [x] 1.3 Signed-out user visiting `/` loads without redirect
- [x] 1.4 Authenticated user with `display_name` visiting `/` redirects to `/dashboard`
- [x] 1.5 Authenticated user without `display_name` visiting `/` redirects to `/onboarding`
- [x] 1.6 Existing protected-route and `/auth/signin` redirects unchanged

### Phase 2: Product Landing Page (Content + Warm Theme)

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Production build passes: `npm run build`
- [x] 2.3 No remaining imports of deleted `Welcome.astro`

#### Manual

- [ ] 2.4 Signed-out `/` shows Polish hero with warm styling and three value-prop cards
- [ ] 2.5 Marketing header with "Zaloguj się" CTA; no Topbar or app nav
- [ ] 2.6 CTAs navigate to `/auth/signin`
- [ ] 2.7 Mobile layout readable and responsive
- [ ] 2.8 Authenticated `/` redirect still works; app pages retain cosmic theme
