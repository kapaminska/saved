# AI Check-in + Safety Implementation Plan

## Overview

Implement roadmap slice S-04 (north star): natural-language monthly check-in parsed by Cloudflare Workers AI, with a review screen and comprehensive safety guards. Covers PRD US-01, FR-011, FR-013–FR-014, FR-032–FR-036. Builds on S-03 manual check-in (`/api/check-in`, `CheckInModal`, payment validation, projections).

## Current State Analysis

S-03 is implemented — batch manual check-in via `CheckInModal` posting to `/api/check-in`, payment validation in `payment-validation.ts`, active-goal ownership checks, RLS on `goal_payments`, and dashboard projections. No AI code exists: no Workers AI binding in `wrangler.jsonc`, no LLM calls, no parse API, no NL input UI, no rate limiting, Zod only as transitive dependency.

### Key Discoveries:

- Manual save path is production-ready and must be reused — `src/pages/api/check-in.ts` validates goals, amounts, months, upserts payments, recalcs `saved_amount`, returns `completedGoals` for celebration redirect
- Validation pattern: `{ ok: true, ... } | { ok: false, error: string }` in `src/lib/goals/payment-validation.ts` — extend for NL input
- `CheckInModal` returns `null` when no active goals (`CheckInModal.tsx:92`) — AI tab inherits this guard
- Cloudflare Workers AI free tier: 10,000 Neurons/day; binding `"ai": { "binding": "AI", "remote": true }` in `wrangler.jsonc`
- Infrastructure risk: 128 MB memory limit — keep prompt compact (goal names only, no payment history), stream-free single-shot parse for ≤20 active goals
- PRD NFR: AI response never saved without structural + domain validation; malformed response = AI unavailable → manual fallback

## Desired End State

An authenticated user with active goals opens the dashboard check-in modal. Default tab is **AI**. They select a month (shared with Manual tab), type a natural-language sentence in Polish or English, and submit. While parsing, a visible loading state with continuous feedback is shown (NFR).

The server validates input (≤500 chars, non-whitespace), checks rate limit (10/hour/user via Supabase), fetches active goals, calls Workers AI, validates the response with Zod, fuzzy-matches goal names, and returns proposals + unrecognized entries.

The user sees a review screen: each proposal has editable amount, goal dropdown (active goals only), and remove button. Unrecognized names appear in a separate flagged section (FR-014) with guidance to create the goal separately. Save posts validated proposals to existing `/api/check-in` — same celebration redirect and dashboard refresh as manual path.

On AI failure, rate limit, or invalid response: error message + prominent "Switch to manual check-in" button activates the Manual tab. User is never blocked.

**Verification:** PL sentence "500 na wakacje, 1000 na poduszkę" → 2 proposals on review → edit amount → save → dashboard updates. Empty input rejected. 501-char input rejected. 11th parse in 1 hour → rate limit message + manual fallback. Nonsense AI response → fallback. Unknown goal name → flagged, not in proposals. Second user cannot trigger parse for another user's goals (auth + RLS).

## What We're NOT Doing

- Inline goal creation from check-in flow — FR-014 flags only
- AI features outside check-in parsing — PRD non-goal
- Dedicated `/check-in` route — stays in dashboard modal
- Zero-amount AI proposals — manual path handles explicit zeros (FR-015 distinction)
- AI parse history UI or admin dashboard
- Unit/integration test framework — manual verification for MVP
- Polish UI localization — English UI, PL+EN NL input
- AI Gateway, persistent logging, cost alerting
- Changing manual check-in behavior — Manual tab preserves S-03 UX exactly

## Implementation Approach

Four phases: (1) rate-limit schema + Workers AI wiring, (2) parse library (validation, Zod schema, fuzzy match, AI orchestration), (3) parse API route, (4) tabbed modal UI with review screen and fallback wiring.

AI parse is read-only — it never writes payments. Save always goes through `/api/check-in`. Rate-limit rows recorded only when AI is actually invoked (after input validation passes).

Model: `@cf/meta/llama-3.1-8b-instruct` via Workers AI binding. Prompt includes user's active goal names and instructs JSON output. Zod validates structure; server-side fuzzy match resolves goal names; domain filter drops non-positive amounts and non-matching goals.

## Critical Implementation Details

### Timing & lifecycle

Rate-limit row is inserted **after** input validation passes and **before** the AI call — so rejected empty/oversized input does not consume quota, but failed AI calls still count (prevents abuse via malformed prompts). If AI call throws, the row remains — intentional cost attribution.

Access Workers AI in Astro API routes via `context.locals.runtime.env.AI` (Cloudflare adapter). Run `wrangler types` after adding the binding to generate TypeScript definitions. Workers AI requires `remote: true` — local dev needs Cloudflare auth (`wrangler login`).

### State sequencing

Review screen save must POST to `/api/check-in` with the **same month** selected in the modal header (shared state across tabs). Do not re-parse on save — review edits are client-side until submit.

---

## Phase 1: Rate-limit Schema & Workers AI Wiring

### Overview

Add Supabase table for AI parse rate limiting, Zod dependency, Workers AI binding, and TypeScript env types.

### Changes Required:

#### 1. AI check-in requests migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_create_ai_checkin_requests.sql` (new)

**Intent**: Track AI parse attempts per user for sliding-window rate limiting (FR-034).

**Contract**:

Table `public.ai_checkin_requests`:

| Column | Type | Constraints |
| --- | --- | --- |
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → auth.users(id) ON DELETE CASCADE |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

Index on `(user_id, created_at DESC)`. RLS enabled; policies `insert_own`, `select_own` using `auth.uid() = user_id`. No UPDATE/DELETE policies needed.

#### 2. TypeScript database types

**File**: `src/types/database.ts`

**Intent**: Add `ai_checkin_requests` Row/Insert types matching migration.

**Contract**: New `ai_checkin_requests` entry under `Tables`.

#### 3. Zod dependency

**File**: `package.json`

**Intent**: Direct dependency for FR-036 structural validation (tech-stack convention).

**Contract**: Add `"zod": "^4.x"` to `dependencies`.

#### 4. Workers AI binding

**File**: `wrangler.jsonc`

**Intent**: Expose Workers AI to the Astro Cloudflare runtime.

**Contract**: Add `"ai": { "binding": "AI", "remote": true }`.

#### 5. Cloudflare env types

**File**: `src/env.d.ts` (extend) + run `npx wrangler types`

**Intent**: Type `AI` binding on runtime env for API routes.

**Contract**: Extend `App.Locals` or reference generated `Env` interface so `context.locals.runtime.env.AI` is typed as `Ai`.

#### 6. Dev documentation

**File**: `.env.example` (extend comment block)

**Intent**: Document that Workers AI needs no API key but requires Cloudflare auth for local dev.

**Contract**: Comment noting `wrangler login` for AI binding in dev; no new env vars.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db reset`
- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Studio shows `ai_checkin_requests` table with RLS enabled
- `wrangler types` generates AI binding types without error

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Parse Library

### Overview

Pure server-side modules for NL input validation, AI response Zod schema, fuzzy goal-name matching, and parse orchestration.

### Changes Required:

#### 1. NL input validation

**File**: `src/lib/goals/ai-checkin/nl-input-validation.ts` (new)

**Intent**: Enforce FR-032 (500 char max) and FR-033 (reject empty/whitespace) before any AI call.

**Contract**:

- Export `validateCheckInText(text: string): { ok: true; text: string } | { ok: false; error: string }`
- Trim input; reject if empty after trim
- Reject if length > 500 with user-facing message mentioning the limit

#### 2. AI response Zod schema

**File**: `src/lib/goals/ai-checkin/parse-schema.ts` (new)

**Intent**: FR-036 structural validation — malformed AI output treated as AI unavailable.

**Contract**:

- Export `AiParseResponseSchema` (Zod) expecting `{ payments: Array<{ goal_name: string; amount: number }> }`
- `goal_name`: non-empty string
- `amount`: positive number (> 0, not ≥ 0 — AI proposals only)
- Export inferred type `AiParseResponse`
- Export `parseAiResponse(raw: unknown)` returning `{ ok: true; data } | { ok: false }`

#### 3. Goal name fuzzy matching

**File**: `src/lib/goals/ai-checkin/goal-name-match.ts` (new)

**Intent**: Hybrid matching — LLM extracts names; server resolves to active goals with typo tolerance.

**Contract**:

- Export `matchGoalName(extractedName: string, activeGoals: { id: string; name: string }[]): { kind: "matched"; goalId: string; goalName: string } | { kind: "unrecognized" }`
- Normalize: lowercase, trim, strip diacritics (Polish chars → ASCII equivalents)
- Match order: exact normalized match → substring containment → Levenshtein distance ≤ 2 for names ≤ 10 chars, ≤ 3 for longer (tune conservatively)
- One extracted name maps to at most one goal; if ambiguous (two goals within threshold), treat as unrecognized

#### 4. Rate limit helper

**File**: `src/lib/goals/ai-checkin/rate-limit.ts` (new)

**Intent**: FR-034 sliding-window check against Supabase table.

**Contract**:

- Export `checkRateLimit(supabase, userId: string, limit: number, windowMs: number): Promise<{ ok: true; remaining: number } | { ok: false; retryAfterMs: number }>`
- Count rows where `user_id = userId` AND `created_at >= now() - windowMs`
- Default: limit=10, windowMs=3600000 (1 hour)
- Export `recordParseAttempt(supabase, userId: string): Promise<void>` — INSERT into `ai_checkin_requests`

#### 5. AI parse orchestration

**File**: `src/lib/goals/ai-checkin/parse-checkin.ts` (new)

**Intent**: Single entry point: call Workers AI, validate, match, partition into proposals and unrecognized.

**Contract**:

- Export `parseCheckInSentence(ai: Ai, text: string, activeGoals: { id: string; name: string }[]): Promise<{ ok: true; proposals: ParsedProposal[]; unrecognized: UnrecognizedEntry[] } | { ok: false; reason: "ai_error" | "invalid_response" }>`
- `ParsedProposal`: `{ goalId, goalName, amount, rawGoalName }`
- `UnrecognizedEntry`: `{ rawGoalName, amount }`
- Build system prompt: list active goal names, instruct JSON output matching schema, support PL ("500 na wakacje") and EN ("500 for vacation") patterns
- Call `ai.run("@cf/meta/llama-3.1-8b-instruct", { messages: [...] })` — parse response text as JSON, run through Zod
- For each payment: if amount ≤ 0, skip silently; run fuzzy match; matched → proposal, unmatched → unrecognized
- Catch all AI/network errors → `{ ok: false, reason: "ai_error" }`
- Do not log user financial text to console in production paths

#### 6. Barrel export

**File**: `src/lib/goals/ai-checkin/index.ts` (new)

**Intent**: Clean imports for API route.

**Contract**: Re-export public functions and types from modules above.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Spot-check fuzzy matcher with seed goal names: exact match, typo ("wakacje" vs "wakacj"), unknown name → unrecognized
- Zod schema rejects `{ payments: [{ goal_name: "", amount: -1 }] }` and malformed JSON shapes
- NL validation rejects empty string and 501-char string

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Parse API Route

### Overview

Authenticated `POST /api/check-in/parse` endpoint wiring validation, rate limiting, goal fetch, and AI orchestration.

### Changes Required:

#### 1. Parse API route

**File**: `src/pages/api/check-in/parse.ts` (new)

**Intent**: Server entry point for AI tab — returns proposals or structured error codes for UI fallback.

**Contract**:

- `POST` handler; auth required (`context.locals.user`) — 401 if missing
- Accept JSON body: `{ text: string }` (Content-Type: application/json)
- Flow:
  1. `validateCheckInText(text)` → 400 with `{ success: false, error, code: "INVALID_INPUT" }`
  2. `checkRateLimit(...)` → 429 with `{ success: false, error, code: "RATE_LIMITED" }`
  3. Fetch active goals for user from `savings_goals` (id, name, status=active)
  4. If zero active goals → 400 `{ code: "NO_GOALS" }`
  5. `recordParseAttempt(...)`
  6. Get `AI` from `context.locals.runtime.env`
  7. If AI binding missing → 503 `{ success: false, error, code: "AI_UNAVAILABLE" }`
  8. `parseCheckInSentence(...)` → on failure 503 `{ code: "AI_UNAVAILABLE" }`
  9. On success → 200 `{ success: true, proposals: [...], unrecognized: [...], rateLimitRemaining: N }`

- Proposal shape for client: `{ goalId, goalName, amount, rawGoalName }`
- Unrecognized shape: `{ rawGoalName, amount }`
- Never include payment IDs — these are proposals, not saved payments

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- Authenticated POST with valid PL sentence returns proposals matching seed goals
- Unauthenticated request → 401
- 11 rapid requests within 1 hour → 429 with `RATE_LIMITED` code
- Empty body → 400 `INVALID_INPUT`
- With Workers AI unavailable/mocked → 503 `AI_UNAVAILABLE`
- Response never contains another user's goal data (RLS)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tabbed Check-in Modal UI

### Overview

Refactor `CheckInModal` into a tabbed modal (AI default, Manual fallback). Add AI input, loading state, review screen with full edit, and fallback messaging.

### Changes Required:

#### 1. Extract manual check-in form

**File**: `src/components/goals/ManualCheckInForm.tsx` (new)

**Intent**: Preserve S-03 manual UX as an isolated component for the Manual tab.

**Contract**:

- Props: `{ goals, month, onMonthChange, loading, onSubmit, error }`
- Move existing per-goal amount fields, zero shortcut, month picker, and submit/cancel from `CheckInModal.tsx`
- Submit handler stays in parent — form calls `onSubmit` with form data
- Behavior unchanged from S-03: empty = skip, "0" = explicit zero, at least one payment required

#### 2. AI check-in tab

**File**: `src/components/goals/AiCheckInTab.tsx` (new)

**Intent**: NL input, parse trigger, loading state, review sub-view, fallback messaging.

**Contract**:

- Props: `{ goals, month, onSwitchToManual, onSaveComplete }`
- **Input view**: textarea (maxLength=500, character counter), submit button, month inherited from parent
- Client-side pre-validation mirrors server (empty, length) before fetch
- On submit: POST `/api/check-in/parse` with `{ text }` — show loading spinner + "Parsing your check-in…" message
- On success with proposals/unrecognized: transition to **review view**
- On error codes:
  - `RATE_LIMITED` / `AI_UNAVAILABLE`: show `ServerError` + button "Switch to manual check-in" calling `onSwitchToManual()`
  - `INVALID_INPUT`: inline error, stay on input view
- **Review view**: list proposals — each row: amount input, goal `<select>` (active goals), remove button; unrecognized section with warning icon + "Create this goal separately" hint (link to `/goals/new`)
- Review actions: "Back" (return to input), "Save check-in" (POST `/api/check-in` with reviewed proposals)
- Save uses same form-urlencoded contract as manual: `payment_month`, repeated `goal_id` + `amount` pairs
- On save success: same celebration redirect logic as manual (`?celebrated=` or reload)
- If all proposals removed and none left: disable save, prompt user to go back or switch manual

#### 3. Tabbed modal shell

**File**: `src/components/goals/CheckInModal.tsx` (refactor)

**Intent**: Single modal with AI | Manual tabs; shared month state; default tab AI.

**Contract**:

- State: `activeTab: "ai" | "manual"` (default `"ai"`), shared `month` state
- Tab bar below modal title: "AI check-in" (default active) | "Manual"
- Render `AiCheckInTab` or `ManualCheckInForm` based on active tab
- `onSwitchToManual` sets `activeTab` to `"manual"` and clears AI errors
- Manual tab submit logic: existing `handleSubmit` posting to `/api/check-in`
- Modal title remains "Monthly check-in"; subtitle changes per tab
- Preserve: return null when `goals.length === 0`, open/close behavior, loading guard on close

#### 4. Dashboard integration

**File**: `src/pages/dashboard.astro`

**Intent**: No prop changes needed if `CheckInModal` interface unchanged.

**Contract**: Verify `CheckInModal` still receives `goals` and `defaultMonth` — adjust only if new props required.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual Verification:

- End-to-end AI check-in: PL sentence → review → save → dashboard shows updated progress/projection/status
- Edit amount and reassign goal on review before save — changes persist correctly
- Remove all proposals → save disabled
- Unrecognized goal flagged, not saved unless user creates goal separately and re-parses
- Rate limit error shows fallback button → Manual tab opens with same month
- AI unavailable (disconnect binding / simulate) → fallback works
- Manual tab behavior identical to pre-S-04
- 501-char textarea blocked client-side; empty submit shows error
- Loading state visible during parse; buttons disabled while loading
- Payment-triggered completion shows celebration modal

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Not in scope for MVP — manual spot-checks for fuzzy matcher and Zod schema during Phase 2

### Integration Tests:

- Not in scope — manual API testing via dev server during Phase 3

### Manual Testing Steps:

1. Seed user with 2+ active goals ("Wakacje", "Poduszka finansowa")
2. AI tab: enter "500 na wakacje, 1000 na poduszkę" → verify 2 proposals on review
3. Edit first proposal amount to 600, save → verify dashboard saved_amount updated
4. Reassign proposal to different goal via dropdown → verify correct goal receives payment
5. Enter sentence with unknown goal "500 na samochód" → verify flagged in unrecognized section
6. Submit empty textarea → client + server rejection
7. Paste 501-character string → rejected before AI
8. Trigger rate limit (11 parses in 1 hour) → rate limit message + manual fallback button
9. Complete check-in via Manual tab → unchanged S-03 behavior
10. Verify second user cannot see first user's parse results (auth)

## Performance Considerations

- Keep AI prompt compact: goal names + IDs only, no payment history — limits token/Neuron usage and memory
- Cap active goals considered in prompt at 20 (dashboard already loads all active; unlikely to exceed for MVP)
- Single-shot AI call (no streaming buffer) — response JSON is small
- Rate limit query uses indexed `(user_id, created_at)` — one COUNT per parse request

## Migration Notes

- New table only — no changes to existing `goal_payments` or `savings_goals`
- No data backfill needed
- Deploy order: migration → app deploy with AI binding (binding missing = graceful 503 fallback)

## References

- Roadmap S-04: `context/foundation/roadmap.md:113-123`
- PRD US-01, FR-011–014, FR-032–036: `context/foundation/prd.md:43-104`
- S-03 manual check-in plan: `context/changes/manual-checkin-payments-projections/plan.md`
- Manual save API: `src/pages/api/check-in.ts`
- Existing modal: `src/components/goals/CheckInModal.tsx`
- Workers AI pricing (free tier): Cloudflare docs — 10,000 Neurons/day
- Infrastructure risks: `context/foundation/infrastructure.md:48-49,79`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Rate-limit Schema & Workers AI Wiring

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db reset` — d37a3bc
- [x] 1.2 Build passes: `npm run build` — d37a3bc
- [ ] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Type checking passes: `npx astro sync && npx tsc --noEmit` — d37a3bc

#### Manual

- [x] 1.5 Studio shows `ai_checkin_requests` table with RLS enabled — d37a3bc
- [x] 1.6 `wrangler types` generates AI binding types without error — d37a3bc

### Phase 2: Parse Library

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual

- [ ] 2.4 Fuzzy matcher spot-check with seed goal names
- [ ] 2.5 Zod schema rejects invalid AI response shapes
- [ ] 2.6 NL validation rejects empty and 501-char input

### Phase 3: Parse API Route

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual

- [ ] 3.4 Authenticated parse with PL sentence returns proposals
- [ ] 3.5 Unauthenticated request returns 401
- [ ] 3.6 11th request within 1 hour returns 429 RATE_LIMITED
- [ ] 3.7 AI unavailable returns 503 AI_UNAVAILABLE

### Phase 4: Tabbed Check-in Modal UI

#### Automated

- [ ] 4.1 Build passes: `npm run build`
- [ ] 4.2 Lint passes: `npm run lint`
- [ ] 4.3 Type checking passes: `npx astro sync && npx tsc --noEmit`

#### Manual

- [ ] 4.4 End-to-end AI check-in with review and dashboard update
- [ ] 4.5 Review edit (amount, reassign, remove) works correctly
- [ ] 4.6 Unrecognized goal flagged; rate limit and AI error fallback to Manual tab
- [ ] 4.7 Manual tab behavior unchanged from S-03
- [ ] 4.8 Input validation (empty, 500 char) and loading states verified
