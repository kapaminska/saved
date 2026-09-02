# Green Brand Lockup Implementation Plan

## Overview

Replace the plain-text landing wordmark `"Saved!"` with the **green celebration lockup** from `logo/Saved Logo - 07 Celebration.dc.html` (Nunito `"Saved"` + green exclamation with cream check), as a shared Astro component used on the landing header and the in-app topbar.

## Current State Analysis

The product name in the UI is almost entirely text. There is no `Logo` component and no static wordmark asset. The design file under `logo/` is a mock sheet, not a runtime import.

The parallel change `tab-favicon` plans a **green tiled favicon** (cream mark on a green rounded square) and explicitly excludes wiring the mark into the topbar or landing wordmark. This plan does not implement the tab icon.

### Key Discoveries:

- Only in-page brand mark: `src/components/MarketingHeader.astro:2` — `<a href="/">Saved!</a>` (`text-xl font-bold`).
- App chrome: `src/components/Topbar.astro` — left side is display name / email (or `"Nie zalogowano"`); right side is nav. No product name. Used on dashboard, profile, goals new/edit/detail/archive.
- Green lockup source: `logo/Saved Logo - 07 Celebration.dc.html:141-147` — text `"Saved"` + SVG `viewBox="0 0 76 122"`, fill `#2f9e6a`, check stroke `#fffdf8`.
- That composition is **not** the favicon tile (`:164-172`) and **not** the amber primary lockup (`:40-45`).
- Nunito is already the app sans (`Layout.astro:22` weights 400–700; `global.css` `--font-sans`). Mock lockup uses weight 800.
- Astro islands are reserved for interactivity; branding stays Astro (see `Banner.astro` props pattern).
- No JS test runner; prior plans verify with `npm run lint` + `npm run build`.

## Desired End State

Landing header and authenticated topbar show the same lockup: visible word `"Saved"` in Nunito plus the green exclamation mark. The landing lockup remains a link to `/`. The topbar lockup sits on the left and links to `/dashboard` when a user is present, otherwise `/`. Display name / email stays visible; nav links are unchanged. Screen readers announce the lockup link as `"Saved!"`. The HTML mock file is not loaded at runtime.

**Verification:** Open `/` and `/dashboard` (logged in). Confirm the mark is green `#2f9e6a` with a cream check — not amber `#e8920c`, not a green tile, not confetti.

## What We're NOT Doing

- Browser tab favicon, apple-touch-icon, or PWA (owned by `tab-favicon`)
- Amber lockup, celebration confetti around the wordmark, or the amber-stem + green-check hybrid
- Auth/onboarding cards (`signin`, `onboarding`)
- Raster PNG/WebP of the full lockup; embedding the `.dc.html` file
- Changing `<title>` strings
- Retargeting `--primary` / theme tokens to `#2f9e6a`
- New JS test runner or Playwright

## Implementation Approach

Extract the green lockup into one Astro component (`BrandLockup`) with a size variant. Compose it as live text + the inner SVG paths from the mock (same approach as the mock sheet). Wire it into `MarketingHeader` and `Topbar`. Add Nunito `800` to the existing Google Fonts URL so the lockup can use `font-extrabold` without a layout shift to a fallback weight.

## Critical Implementation Details

The mock’s header look is **CSS text + a tall inner SVG**, not a square tile. Copying the favicon tile into the header would drop the word `"Saved"` and add a green square the mock never uses in the lockup. Runtime-importing `logo/*.dc.html` is invalid (it depends on `./support.js` and is a design canvas). Keep fill/stroke hexes on the SVG (`#2f9e6a`, `#fffdf8`); do not map them through `text-primary`.

### User experience spec

The visible word is `"Saved"` without a text exclamation; the SVG is the bang. The accessible name of the wrapping link is still `"Saved!"` (current landing copy). Put `aria-hidden="true"` on the SVG so the checkmark is not announced twice.

On the topbar, order is: lockup (left) → identity (display name / email) → nav (right). On narrow viewports the bar may wrap; the lockup must not displace identity or nav off-screen without wrapping. Unauthenticated Topbar (if rendered) still shows the lockup on the left.

---

## Phase 1: Shared BrandLockup

### Overview

Add a reusable Astro lockup and load Nunito 800 so landing and topbar can share one mark.

### Changes Required:

#### 1. BrandLockup component

**File**: `src/components/BrandLockup.astro` (new)

**Intent**: Encode the green celebration lockup once so MarketingHeader and Topbar cannot drift.

**Contract**: Props: `size: "marketing" | "nav"` (`marketing` ≈ current `text-xl` landing; `nav` ≈ mock topbar ~24–26px). Renders an `inline-flex` row: text node `Saved` (Nunito extrabold, `text-foreground`, tight tracking) + SVG from the green lockup (`viewBox="0 0 76 122"`). SVG is `aria-hidden="true"` and has no accessible name. Do not wrap in an `<a>` here — callers own the link.

```svg
<!-- geometry: logo/Saved Logo - 07 Celebration.dc.html:143-147; scale via CSS width/height per size, do not change viewBox -->
<svg viewBox="0 0 76 122" fill="none" aria-hidden="true">
  <rect x="27" y="6" width="18" height="58" rx="9" fill="#2f9e6a"/>
  <circle cx="36" cy="96" r="23" fill="#2f9e6a"/>
  <path d="M27 97 L34 105 L48 88" stroke="#fffdf8" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

#### 2. Nunito 800

**File**: `src/layouts/Layout.astro`

**Intent**: Match the mock lockup weight without pulling a second font family.

**Contract**: Extend the existing Nunito `wght@` list with `800`. Do not add JetBrains Mono. Do not change default `title` or favicon links.

### Success Criteria:

#### Automated Verification:

- `src/components/BrandLockup.astro` exists and contains `#2f9e6a` (not `#e8920c`)
- `Layout.astro` Nunito URL includes `800`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Component renders `"Saved"` plus a green bang with cream check at both sizes when used in isolation / first call site in phase 2

**Implementation Note**: After automated checks pass, proceed to phase 2 in the same session unless the SVG geometry looks wrong against the HTML mock.

---

## Phase 2: Wire landing and topbar

### Overview

Replace the landing text wordmark and add the lockup to the app shell without dropping user identity or nav.

### Changes Required:

#### 1. Marketing header

**File**: `src/components/MarketingHeader.astro`

**Intent**: The public landing brand is the green lockup, still a home link.

**Contract**: The existing `<a href="/">` wraps `<BrandLockup size="marketing" />`. Accessible name of the link is `Saved!` (`aria-label="Saved!"` is acceptable because the visible text is `Saved` without `!`). No extra confetti.

#### 2. App topbar

**File**: `src/components/Topbar.astro`

**Intent**: Authenticated chrome matches the mock’s left-side lockup while keeping “who am I” and existing routes.

**Contract**: Left cluster: `<a>` wrapping `<BrandLockup size="nav" />` (`href="/dashboard"` if `user`, else `href="/"`), same `aria-label="Saved!"`. Identity (`displayName ?? email` or `"Nie zalogowano"`) remains visible in that left cluster, not removed. Right cluster (Panel / Archiwum / Profil / Wyloguj, or sign-in) unchanged. Pages that import Topbar do not need edits.

### Success Criteria:

#### Automated Verification:

- `MarketingHeader.astro` no longer uses a bare text node `Saved!` as the only brand (lockup component is imported)
- `Topbar.astro` imports `BrandLockup`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `/` : lockup in header, click → stays/goes home; no amber bang; no green tile
- Logged-in `/dashboard`, `/profile`, `/goals/archive`: lockup left, identity still visible, nav still works; lockup click → dashboard
- Narrow viewport: lockup + identity + nav all reachable (wrap/stack, not clipped)
- Auth pages unchanged (no lockup)

**Implementation Note**: Pause for human visual check against the green lockup panel in the HTML mock before calling the change done.

---

## Testing Strategy

### Unit Tests:

- None — no JS test runner in this repo; not in scope

### Integration Tests:

- None

### Manual Testing Steps:

1. `npm run dev` → open `/` → compare header to green lockup in `logo/Saved Logo - 07 Celebration.dc.html` (section “Green variant”)
2. Log in → `/dashboard` → confirm lockup + identity + nav
3. Click lockup from dashboard → `/dashboard`; from landing → `/`
4. Resize to mobile width
5. Open `/auth/signin` — no new brand mark

## Performance Considerations

Inline SVG is tiny. Extra Nunito 800 is one additional face on the existing Google Fonts request. No runtime fetch of `logo/`.

## Migration Notes

None. Visual-only; no data or env changes. Do not merge this work into `tab-favicon`.

## References

- Design: `logo/Saved Logo - 07 Celebration.dc.html` (green lockup ~141–147; topbar mock ~115–131 for layout, not amber color)
- Landing: `src/components/MarketingHeader.astro`
- App shell: `src/components/Topbar.astro`
- Sibling (out of scope): `context/changes/tab-favicon/plan.md`
- Archived landing wordmark: `context/archive/2026-06-23-landing-page-unauthenticated/plan.md` (MarketingHeader as text `"Saved!"`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared BrandLockup

#### Automated

- [x] 1.1 `src/components/BrandLockup.astro` exists and contains `#2f9e6a` (not `#e8920c`) — 7b98571
- [x] 1.2 `Layout.astro` Nunito URL includes `800` — 7b98571
- [x] 1.3 Lint passes: `npm run lint` — 7b98571
- [x] 1.4 Build passes: `npm run build` — 7b98571

#### Manual

- [x] 1.5 Component renders `"Saved"` plus a green bang with cream check at both sizes when used in isolation / first call site in phase 2 — 7b98571

### Phase 2: Wire landing and topbar

#### Automated

- [x] 2.1 `MarketingHeader.astro` no longer uses a bare text node `Saved!` as the only brand (lockup component is imported)
- [x] 2.2 `Topbar.astro` imports `BrandLockup`
- [x] 2.3 Lint passes: `npm run lint`
- [x] 2.4 Build passes: `npm run build`

#### Manual

- [x] 2.5 `/` : lockup in header, click → stays/goes home; no amber bang; no green tile
- [x] 2.6 Logged-in `/dashboard`, `/profile`, `/goals/archive`: lockup left, identity still visible, nav still works; lockup click → dashboard
- [x] 2.7 Narrow viewport: lockup + identity + nav all reachable (wrap/stack, not clipped)
- [x] 2.8 Auth pages unchanged (no lockup)
