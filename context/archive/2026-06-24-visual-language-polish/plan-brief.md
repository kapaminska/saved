# Visual Language Polish — Plan Brief

> Full plan: `context/changes/visual-language-polish/plan.md`

## What & Why

Saved! currently looks like two different products: a warm cream/amber landing page and a dark cosmic app interior (navy gradients, purple CTAs, glass cards). Roadmap slice S-06 harmonizes the authenticated experience with the landing's warm visual language — fulfilling the PRD's motivating presentation tone and shape-notes requirements (ciepła paleta, humanist sans-serif, 12–16px cards, mikro-interakcje).

## Starting Point

S-05 delivered `bg-warm` and inline amber styling on the landing only. ~25 files across auth, dashboard, goals, check-in, net worth, and celebration still use `bg-cosmic` with duplicated purple/white-10 Tailwind classes. shadcn CSS variables exist but are neutral and mostly bypassed. No custom font is loaded. Sign-in is the first jarring transition after the warm landing CTA.

## Desired End State

Every user-facing surface — landing through dashboard, goals, check-in, net worth, and goal celebration — shares one warm light design system: Nunito typography, cream/amber shadcn tokens, 12px card radius, and hover/focus transitions. Clicking "Zaloguj się" feels like entering the same product. The cosmic theme is fully removed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Typeface | Nunito (Google Fonts) | Rounded humanist sans matches warm savings-app tone and Polish diacritics | Plan |
| App theme | Full warm light | One cohesive product from landing through dashboard — S-06 outcome verbatim | Plan |
| Token strategy | Retarget shadcn CSS variables | Single source of truth; shadcn components become usable; future changes are cheap | Plan |
| Landing scope | Refactor to shared tokens | Landing and app share semantic classes, not parallel amber inline + token systems | Plan |
| Auth flow | Warm sign-in matching landing | Eliminates jarring cosmic sign-in after warm landing CTA | Plan |
| Celebration (FR-010) | Warm modal + amber confetti | Brand moment aligns with "Saved!" warmth, not leftover cosmic styling | Plan |
| Micro-interactions | Hover/focus transitions | Meets shape-notes requirement without animation scope creep | Plan |
| Border radius | 12px base (`--radius: 0.75rem`) | Shape-notes lower bound; matches landing `rounded-xl` cards | Plan |
| Scope | Full — all surfaces | Complete S-06 with no visual debt on secondary pages | Plan |
| Cosmic theme | Remove entirely | Clean break; grep confirms zero purple/cosmic leftovers | Plan |
| Outliers | Restyle Banner.astro | Config warnings readable on warm cream backgrounds | Plan |

## Scope

**In scope:** Nunito font, warm shadcn token palette, shared form/button primitives, all pages and components (~25 files), landing token refactor, warm celebration modal + confetti colors, Banner.astro fix, cosmic removal, lint/build verification, manual visual checklist.

**Out of scope:** Dark mode, new layout abstractions, animation beyond CSS transitions, copy changes, functional/logic changes, visual regression test framework, LibBadge.astro removal, slogan decision.

## Architecture / Approach

Retarget `:root` shadcn CSS variables in `global.css` to warm cream/amber values derived from the landing palette. Load Nunito in `Layout.astro`. Migrate `FormField` and `SubmitButton` first (propagates to all forms), then sweep pages and components replacing `bg-cosmic` and hardcoded purple/glass classes with semantic tokens (`bg-card`, `bg-primary`, `text-foreground`, `border-border`). Status badges and modals retuned for light-background contrast. Four phases: tokens → primitives → all surfaces → cleanup/verify.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Design tokens & font | Nunito, warm CSS variables, 12px radius, remove bg-cosmic | Token contrast values need visual tuning on real screens |
| 2. Shared UI primitives | FormField, SubmitButton, Button aligned to tokens | Missing a primitive override leaves cosmic styling in forms |
| 3. All surfaces migration | ~25 files: landing, auth, dashboard, goals, check-in, net worth, celebration | Large diff — easy to miss a purple class in a modal or badge |
| 4. Cleanup & verification | Banner.astro, grep audit, lint/build, visual checklist | False confidence if manual checklist skipped on secondary routes |

**Prerequisites:** S-05 (landing) done; all functional slices (S-01–S-04, S-07) implemented.
**Estimated effort:** ~2–3 focused sessions across 4 phases.

## Open Risks & Assumptions

- Exact OKLCH/hex values for warm shadcn tokens require visual tuning during implementation — landing palette is the reference, not a spec sheet
- Google Fonts dependency adds external network request (acceptable for MVP; preconnect mitigates)
- Removing `backdrop-blur-xl` glass effects changes visual depth — warm shadows (`shadow-sm`/`shadow-md`) compensate
- Status badge green/amber/red tints on light bg need contrast check for WCAG AA (especially amber "behind" badge)

## Success Criteria (Summary)

- User walks landing → sign-in → dashboard without noticing a theme change
- Zero `bg-cosmic` / purple-gradient references in `src/`
- Nunito renders on all pages; cards and buttons use warm semantic tokens consistently
- Goal celebration modal and confetti feel warm, not cosmic
