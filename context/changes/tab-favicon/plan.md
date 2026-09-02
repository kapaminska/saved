# Browser Tab Favicon Implementation Plan

## Overview

Replace the leftover Astro starter tab icon with the **green favicon tile** from `logo/Saved Logo - 07 Celebration.dc.html` so every page of Saved! shows the celebration mark (cream exclamation + green check on a green rounded square) in the browser tab.

## Current State Analysis

`Layout.astro` already sets a tab icon, but it points at the starter asset. The product mark the user wants lives only as inline SVG inside a design HTML file under `logo/`.

### Key Discoveries:

- Tab icon is a single `<link rel="icon">` in `src/layouts/Layout.astro:19` → `/favicon.png`, `type="image/png"`. Default document title is `"Saved!"` (`Layout.astro:11`).
- `public/favicon.png` is the **navy starter** wordmark, not the warm/green Saved! mark.
- Green favicon mock is `logo/Saved Logo - 07 Celebration.dc.html:164-172`: 44×44 rounded square, `linear-gradient(150deg, #3fb37c, #2f9e6a)`, inner mark `viewBox="0 0 76 122"` with cream stem/dot (`#fffdf8`) and check stroke `#2f9e6a`.
- Green lockup wordmark (`:143-147`) is a different composition (green fill, cream check, no tile). **Do not use that** — the labeled `favicon` tile is the source of truth.
- No `apple-touch-icon`, no webmanifest. Out of scope by decision.
- README rewrite and JS test runner are **not** roadmap slices; prior plans deferred unit tests as MVP out of scope. This change does not add them.

## Desired End State

A user with Saved! open sees the green celebration tile in the tab on landing, auth, dashboard, goals, and every other page that uses `Layout.astro`. Hard-refresh no longer shows the navy starter “saved!” glyph. Source of the mark remains the HTML mock; `logo/` stays a design reference, not a runtime dependency.

**Verification:** Open several routes, hard-refresh, confirm the tab icon matches the green favicon tile (not the amber tile at lines 103–112, not the mixed amber+green check at 175–179).

## What We're NOT Doing

- Apple touch icon, PWA manifest, or `favicon.ico`
- Wiring the mark into the in-app topbar / landing wordmark
- Deleting `public/template.png` or rewriting README
- Adding Vitest/Playwright
- Changing page `<title>` strings
- Using the amber favicon tile or the “amber stem + green check” hybrid

## Implementation Approach

One phase: encode the green favicon **tile** (background + mark) as a standalone SVG so the tab gets the same rounded green square as the mock (CSS around the inner SVG will not apply if we only extract the paths). Point `Layout.astro` at that SVG. Overwrite `public/favicon.png` with a raster of the same tile so browsers that still request `/favicon.png` by default do not resurrect the starter icon.

## Critical Implementation Details

The HTML mock is **not** a favicon file. The visible tile is a CSS-sized `div` (gradient + `border-radius: 12px`) wrapping a tall inner SVG. The implementer must flatten that into one square SVG (`viewBox` covering a rounded rect + the scaled mark) so the tab icon includes the green background. Exporting only the inner `76×122` paths yields a cream-on-transparent exclamation with no tile — that is the wrong result.

## Phase 1: Green tab favicon

### Overview

Ship the green favicon tile as static assets and wire the shared layout so every page picks it up.

### Changes Required:

#### 1. Standalone green favicon SVG

**File**: `public/favicon.svg` (new)

**Intent**: Persist the labeled green favicon from the logo HTML as a real static asset the browser can load.

**Contract**: Square SVG. Rounded square filled with gradient `150deg, #3fb37c → #2f9e6a` (`#2f9e6a` is the green lockup token from the HTML). Center the existing mark:

```svg
<!-- mark geometry from logo/Saved Logo - 07 Celebration.dc.html:166-169; scale into the tile, do not copy the CSS wrapper -->
<svg viewBox="0 0 76 122" fill="none">
  <rect x="27" y="8" width="18" height="54" rx="9" fill="#fffdf8"/>
  <circle cx="36" cy="94" r="22" fill="#fffdf8"/>
  <path d="M28 95 L34 102 L47 88" stroke="#2f9e6a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Do not runtime-import the `.dc.html` file.

#### 2. Replace starter PNG

**File**: `public/favicon.png`

**Intent**: Stop serving the navy starter icon on the historical `/favicon.png` URL.

**Contract**: Raster of the same green tile (at least 32×32; 48 or 64 preferred for retina tabs). Overwrite in place; do not keep the starter under another name in `public/`.

#### 3. Layout head link

**File**: `src/layouts/Layout.astro`

**Intent**: Prefer the SVG tile; keep a PNG alternate for agents that ignore SVG icons.

**Contract**: Primary `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`. Secondary `<link rel="icon" type="image/png" href="/favicon.png" />`. No apple-touch or manifest links. Do not change `title` default or font tags.

### Success Criteria:

#### Automated Verification:

- `public/favicon.svg` exists and contains `#2f9e6a` / `#3fb37c` (not the amber `#e8920c` tile)
- `public/favicon.png` is no longer the navy starter (file changed vs previous starter bytes)
- `src/layouts/Layout.astro` references `/favicon.svg`
- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Hard-refresh landing and dashboard: tab shows the green rounded tile with cream mark
- Amber wordmark tile and hybrid amber+green check are **not** what appears in the tab
- Unrelated pages (signin, archive) share the same icon via Layout

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the tab icon is the green tile.

---

## Testing Strategy

### Unit Tests:

- None — no JS test runner in this repo; not in scope

### Integration Tests:

- None

### Manual Testing Steps:

1. `npm run dev` → open `/` → hard-refresh (bypass cache) → inspect tab
2. Open `/dashboard` and `/auth/signin` in extra tabs — same icon
3. Optional: DevTools Network confirm `/favicon.svg` 200

## Performance Considerations

Favicon is a tiny static file. No runtime cost.

## Migration Notes

Browsers cache favicons aggressively. Manual QA must hard-refresh or use a private window. No database or env changes.

## References

- Design source: `logo/Saved Logo - 07 Celebration.dc.html` (green favicon tile ~lines 164–172)
- Layout: `src/layouts/Layout.astro:16-24`
- Visual tokens (context only): `src/styles/global.css` — do not retarget app `--primary` to green for this change
- Change notes: `context/changes/tab-favicon/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Green tab favicon

#### Automated

- [x] 1.1 `public/favicon.svg` exists and contains `#2f9e6a` / `#3fb37c` (not the amber `#e8920c` tile) — d7d53e7
- [x] 1.2 `public/favicon.png` is no longer the navy starter (file changed vs previous starter bytes) — d7d53e7
- [x] 1.3 `src/layouts/Layout.astro` references `/favicon.svg` — d7d53e7
- [x] 1.4 Build passes: `npm run build` — d7d53e7
- [x] 1.5 Lint passes: `npm run lint` — d7d53e7

#### Manual

- [x] 1.6 Hard-refresh landing and dashboard: tab shows the green rounded tile with cream mark — d7d53e7
- [x] 1.7 Amber wordmark tile and hybrid amber+green check are not what appears in the tab — d7d53e7
- [x] 1.8 Unrelated pages (signin, archive) share the same icon via Layout — d7d53e7
