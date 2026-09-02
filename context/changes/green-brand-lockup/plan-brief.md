# Green Brand Lockup — Plan Brief

> Full plan: `context/changes/green-brand-lockup/plan.md`

## What & Why

Landing still shows a plain `"Saved!"` string. We want the green celebration lockup from the logo sheet: Nunito **Saved** plus a green exclamation with a cream check, reused in the app topbar so the product mark isn’t landing-only.

## Starting Point

`MarketingHeader.astro` is the only in-page wordmark. `Topbar.astro` shows identity + nav, no brand. The green lockup exists only in `logo/Saved Logo - 07 Celebration.dc.html`. `tab-favicon` is a separate planned change for the tab tile.

## Desired End State

Landing header and logged-in topbar share one lockup. Landing links home; topbar lockup links to the dashboard. Name/email stays. Readers hear `"Saved!"`. Auth pages and the tab icon are untouched.

## Key Decisions Made

| Decision | Choice | Why |
| -------- | ------ | --- |
| Surfaces | Landing + topbar | Replace the existing wordmark and match the HTML topbar mock |
| Variant | Green lockup `#2f9e6a`, not tile / amber | User asked for the green bang; tile is favicon |
| Construction | Nunito text + inline SVG | Matches the mock; scales; uses the app font |
| Component | Shared `BrandLockup.astro` | One geometry for two call sites |
| Topbar layout | Lockup left, identity kept, nav unchanged | Mock layout without dropping “who am I” |
| A11y | Visible `Saved` + `aria-hidden` SVG; link name `Saved!` | Same name as today’s wordmark |

## Scope

**In scope:** `BrandLockup`, Nunito 800, `MarketingHeader`, `Topbar`

**Out of scope:** Favicon/PWA, amber/confetti/hybrid marks, auth pages, raster lockup, theme token retarget, JS tests

## Architecture / Approach

Astro component (no React island): text + SVG paths copied from the mock. Callers wrap it in `<a>`. Hex colors stay on the SVG. `logo/` remains design reference only.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Shared BrandLockup | Component + font weight 800 | Wrong SVG (tile or amber) |
| 2. Wire chrome | Landing + topbar | Crowded mobile topbar |

**Prerequisites:** `logo/Saved Logo - 07 Celebration.dc.html` in repo
**Estimated effort:** ~1 session, 2 phases

## Open Risks & Assumptions

- Topbar is tight on mobile; wrapping is preferred over dropping identity
- Green lockup hex is intentional and will not match `--primary` amber
- `tab-favicon` stays a separate change

## Success Criteria (Summary)

- `/` and app topbar show Saved + green bang (cream check)
- Identity and nav still work; auth unchanged
- Accessible link name remains `"Saved!"`
