# AI Check-in + Safety — Plan Brief

> Full plan: `context/changes/ai-checkin-safety/plan.md`

## What & Why

Deliver roadmap slice S-04 (north star): user types a natural-language sentence, AI parses it into structured payments, user reviews/edits, and saves — with safety guards so AI failure never blocks check-in. This is the product's core bet (FR-011): one sentence replaces manual form-filling, while FR-032–FR-036 ensure financial data integrity.

## Starting Point

S-03 is implemented — `CheckInModal`, `/api/check-in`, payment validation, projections, and RLS provide a working manual fallback. No AI integration exists: no LLM client, no parse API, no NL input UI, no rate limiting, no Zod in direct dependencies. `wrangler.jsonc` has no Workers AI binding.

## Desired End State

User opens the dashboard check-in modal (tabbed: **AI** default, **Manual** fallback). On the AI tab they pick a month, type a sentence in Polish or English (e.g. "500 na wakacje, 1000 na poduszkę"), and see a loading state while Workers AI parses. A review screen shows matched proposals (editable amount, reassignable goal dropdown, removable rows) plus flagged unrecognized goal names. Save posts to existing `/api/check-in`. Input over 500 chars or whitespace-only is rejected client-side and server-side before AI. Rate limit (10 parse requests/hour/user) enforced via Supabase; exceeded limit shows message + "Switch to manual check-in" button. AI errors or invalid responses trigger the same fallback — user is never blocked.

## Key Decisions Made

| Decision             | Choice                                   | Why (1 sentence)                                                                                   | Source |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| AI provider          | Cloudflare Workers AI (free tier)        | 10,000 Neurons/day at no cost; runs on existing edge runtime — no external API key.                | Plan   |
| Model                | `@cf/meta/llama-3.1-8b-instruct`         | Small, fast, low Neuron cost; sufficient for structured extraction with Zod validation safety net. | Plan   |
| Rate limit storage   | Supabase `ai_checkin_requests` table     | Persists across Worker instances; auditable; fits existing stack.                                  | Plan   |
| Rate limit threshold | 10 requests / hour / user                | Generous for monthly ritual + re-parses; manual tab always available.                              | Plan   |
| Check-in UX          | Tabbed modal (AI \| Manual)              | Single entry point; FR-034 fallback is one click to Manual tab.                                    | Plan   |
| Goal matching        | LLM extraction + server-side fuzzy match | Catches typos and Polish inflections; unrecognized names flagged per FR-014.                       | Plan   |
| Review editing       | Amount + goal dropdown + remove          | Full FR-013 — reassign, edit amount, remove before save.                                           | Plan   |
| Fallback UX          | Inline error + switch to Manual tab      | User never blocked; preserves modal context.                                                       | Plan   |
| Language             | Polish + English NL input                | Matches PRD examples and demo audiences; UI stays English.                                         | Plan   |
| Save path            | Reuse `/api/check-in`                    | Existing validation, RLS, SUM sync, and celebration redirect — no duplicate save logic.            | Plan   |

## Scope

**In scope:**

- Workers AI binding + parse service with Zod structural validation (FR-036)
- NL input validation (500 char, non-empty) — FR-032, FR-033
- Per-user rate limiting with Supabase table — FR-034
- Domain filtering (positive amounts, active goals only) — FR-035
- Unrecognized goal flagging — FR-014
- AI review screen with full edit — FR-013
- Tabbed check-in modal on dashboard
- FR-011, FR-013–FR-014, FR-032–FR-036, US-01

**Out of scope:**

- Inline goal creation from check-in (FR-014 — flag only)
- AI for anything other than check-in parsing (PRD non-goal)
- AI parse audit UI / admin dashboard
- Unit/integration test framework
- Polish UI localization
- AI Gateway, observability dashboards, cost alerting
- Zero-amount AI proposals (AI requires positive amounts; manual path handles zeros)

## Architecture / Approach

```
Dashboard CheckInModal (tabs)
  AI tab: textarea → POST /api/check-in/parse
    → validate NL input → rate-limit check (Supabase) → fetch active goals
    → Workers AI (structured JSON prompt) → Zod validate → fuzzy-match goal names
    → return proposals + unrecognized
  Review: editable rows → POST /api/check-in (existing S-03 path)
  Manual tab: existing per-goal form (unchanged behavior)
```

Workers AI binding added to `wrangler.jsonc`. Parse logic in `src/lib/goals/ai-checkin/` (validation, schema, matching, orchestration). Rate-limit rows inserted only when AI is actually invoked (post input validation).

## Phases at a Glance

| Phase                                    | What it delivers                                              | Key risk                                                              |
| ---------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. Rate-limit schema & Workers AI wiring | Migration, Zod dep, AI binding, env types                     | Local dev requires `remote: true` — Workers AI always hits Cloudflare |
| 2. Parse library                         | NL validation, Zod schema, fuzzy match, AI orchestration      | Model JSON reliability — mitigated by Zod + fallback                  |
| 3. Parse API                             | `POST /api/check-in/parse` with auth, rate limit, error codes | Accessing `locals.runtime.env.AI` in Astro adapter                    |
| 4. Tabbed UI                             | AI tab + review screen + manual fallback wiring               | Modal state complexity (tab switch, review sub-view)                  |

**Prerequisites:** S-03 complete ✓ (`/api/check-in`, `CheckInModal`, payment validation)
**Estimated effort:** ~3–4 sessions across 4 phases

## Open Risks & Assumptions

- Workers AI free tier (10,000 Neurons/day) is sufficient for portfolio/demo usage; heavy testing may hit daily cap — manual fallback covers this
- `@cf/meta/llama-3.1-8b-instruct` may mis-parse complex Polish sentences — review screen + manual fallback are the safety net
- Fuzzy-match threshold needs tuning; start conservative (high similarity) to avoid wrong-goal assignment
- Workers AI runs remotely even in local dev — requires Cloudflare auth for `wrangler dev`
- No observability yet — parse failures logged via `console.error` only

## Success Criteria (Summary)

- User completes end-to-end AI check-in: sentence → review → save → dashboard updates with projection/status
- Safety guards work: 500-char limit, empty rejection, rate limit with manual fallback, invalid AI response → manual fallback
- Unrecognized goal names flagged; user cannot save AI proposal for non-existent goal without reassignment
- Manual tab unchanged and always reachable — AI failure never blocks the user
