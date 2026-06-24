# Landing Page for Unauthenticated Users — Plan Brief

> Full plan: `context/changes/landing-page-unauthenticated/plan.md`

## What & Why

Replace the Astro starter page at `/` with a Polish product landing that explains Saved!'s value (savings goals, monthly check-in, progress projection) and provides a clear magic-link login path. Authenticated users must never see the landing — they go to dashboard or onboarding. Delivers PRD US-02, FR-037 and Secondary Success Criteria.

## Starting Point

`/` renders `Welcome.astro` with starter-kit copy ("10x Astro Starter") on the cosmic dark theme. CTAs already point to `/auth/signin`. Middleware protects app routes but does not redirect logged-in users away from `/`. Auth is magic-link OTP (S-01 complete).

## Desired End State

Unauthenticated visitors see a warm-toned Polish landing: marketing header ("Saved!" + "Zaloguj się"), hero with slogan **"Odkładaj na cele. Świętuj każdy z nich."**, and three feature cards. Authenticated users hitting `/` redirect to `/dashboard` (onboarded) or `/onboarding` (new). App pages keep the existing cosmic theme until S-06.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Auth redirect on `/` | Match existing flow: `display_name` → dashboard, else → onboarding | Consistent with verify-otp and signin redirect patterns already in middleware | Plan |
| Content depth | Hero + 3 feature cards | Covers FR-037 pillars fast; mirrors existing Welcome layout | Plan |
| Language | Polish | Matches PRD persona and examples | Plan |
| Slogan | "Odkładaj na cele. Świętuj każdy z nich." | Warm, celebration-aligned brand line from PRD options | Plan |
| Visual scope | Warm palette on landing in this slice | User chose early warm identity over deferring entirely to S-06 | Plan |
| Header | Dedicated marketing header | Cleaner marketing presentation; no app nav on landing | Plan |
| CTA target | `/auth/signin` | Single magic-link entry point (S-01) | Research / PRD |
| Phase structure | 2 phases: routing, then content+theme | Routing verifiable independently before UI work | Plan |

## Scope

**In scope:**
- Middleware redirect for authenticated users on `/`
- `LandingPage.astro` with Polish hero + 3 value-prop cards
- `MarketingHeader.astro` (product name + login CTA)
- Warm landing CSS utilities in `global.css`
- Delete `Welcome.astro` starter component
- Optional `lang="pl"` on landing via Layout prop

**Out of scope:**
- How-it-works sections, example check-in, footer
- Polish localization of auth/app pages
- App-wide warm theme (S-06)
- SEO/meta tags, analytics
- Interactive demos or net worth preview

## Architecture / Approach

Phase 1 adds an exact-match `/` redirect in middleware after user/profile resolution — same destination rules as post-OTP login. Phase 2 introduces `LandingPage.astro` + `MarketingHeader.astro` with landing-scoped warm CSS utilities (`bg-warm`, etc.) while leaving `bg-cosmic` and shadcn tokens untouched for authenticated views. `index.astro` stays a thin Layout wrapper.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Authenticated `/` redirect | Middleware closes FR-037 auth gap | Redirect loop if pathname match is too broad |
| 2. Product landing (content + warm theme) | Polish landing replaces starter scaffold | Warm palette scope creep into app pages; S-06 may refine tokens |

**Prerequisites:** None (parallel with Stream B; auth at `/auth/signin` already works)
**Estimated effort:** ~1–2 sessions across 2 phases

## Open Risks & Assumptions

- Warm landing utilities may need adjustment when S-06 defines app-wide design tokens — landing-only scope limits rework
- Auth/signin page stays English + cosmic theme — brief Polish/English mix across the login funnel until a localization slice
- No automated tests for middleware redirect — manual verification is the gate

## Success Criteria (Summary)

- Unauthenticated user understands product value and reaches magic-link sign-in in one click
- Authenticated user never sees landing content at `/`
- Landing presents warm, portfolio-ready Polish copy covering goals, check-in, and projection
