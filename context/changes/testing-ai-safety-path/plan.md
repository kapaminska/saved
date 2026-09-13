# AI safety path — parse fallback, invalid payload, and quota tests

## Overview

Add Vitest unit and integration tests that prove Risks #4, #5, and #6 from `context/foundation/test-plan.md`: AI failure degrades to a manual path without recording the month; out-of-contract model output never becomes a payment row; the 11th parse in the hour is denied with a fallback signal. Safeguards already exist in product code. This change locks them in CI. No product code, no React tests, no OTP Vitest, no Playwright.

## Current State Analysis

Parse is proposal-only (`POST /api/check-in/parse`). The month is recorded only by `POST /api/check-in`. `parse.test.ts` already covers 401, `INVALID_INPUT`, 429 `RATE_LIMITED`, `NO_GOALS`, 503 `AI_UNAVAILABLE` (throw + unparsable text), and 200 proposals. It never inspects `mock.calls` for `goal_payments` or `ai_checkin_requests` insert. Schema tests cover amount `0` and empty `goal_name`, not negative or mixed fail-closed. Save tests cover explicit zero and skip, not `amount: "-1"`.

OTP send has no app limiter (S-01 F7 = comment). Out of this phase.

Research (`research.md`) is the ground truth. §2 response guidance was backported on 2026-09-07 (no file anchors).

### Key Discoveries:

- Parse 200 body is `proposals` / `unrecognized` / `rateLimitRemaining` — not a payment write (`parse.ts:83-88`).
- `recordParseAttempt` runs after validation + rate-limit pass + active goals, **before** AI (`parse.ts:65-71`). Failed AI still burns quota.
- Zod `amount.gt(0)` fail-closes the **whole** payload (`parse-schema.ts:3-9`). Archived per-item “skip ≤ 0” did not ship.
- Save uses form `goal_id` + `amount` (`check-in.ts:32-61`). `parsePaymentAmount` rejects `"-1"` via `/^\d+/` (`payment-validation.ts:21-23`). Save still allows `"0"` (FR-015).
- UI fallback keys `RATE_LIMITED` and `AI_UNAVAILABLE` (`AiCheckInTab.tsx:106-109`). No React tests this phase — handler codes + copy are the contract.
- AI mock is `mockAiRun` from `src/test/vitest-mocks.ts`, not `locals.runtime`.
- `check-in.test.ts` already has `paymentUpserts(mock)` for `goal_payments` + `upsert`. Copy that filter locally in `parse.test.ts`; do not grow the harness for one file.

## Desired End State

`npm test` fails if:

1. `POST /api/check-in/parse` on 200, 429, or 503 records a `goal_payments` upsert/insert.
2. A 200 parse is treated as “month saved” (no separate save hop).
3. 429 `RATE_LIMITED` (count ≥ 10) still calls `mockAiRun` or inserts `ai_checkin_requests`.
4. 503 after a passed rate-limit does **not** insert `ai_checkin_requests`.
5. `INVALID_INPUT` or `NO_GOALS` inserts a parse-attempt row.
6. 429 / 503 bodies omit `code` or omit the manual-path signal in `error`.
7. `parseAiResponse` accepts a negative amount, or a mixed array with one bad amount.
8. `parseCheckInSentence` returns proposals when the model JSON fails Zod.
9. `POST /api/check-in` with `amount: "-1"` or a non-numeric amount upserts a payment.

After implementation, `context/foundation/test-plan.md` §6.5 contains the AI-failure / invalid-payload cookbook; §6.6 notes this phase; §7 names OTP app limiting as negative space.

### Verification

- `npm test` passes locally and in CI (no new secrets, jobs, Docker, or Playwright).
- Each new `it` names the failure (no-write, quota, fail-closed, save rejects junk) — not “covers parse.ts.”

## What We're NOT Doing

- Product changes (app-level AI timeout, missing-binding branch, OTP app limiter, per-item amount skip).
- React / jsdom tests of `AiCheckInTab` or `CheckInModal`.
- Playwright, MSW, coverage thresholds, `locals.runtime.env.AI` on the harness.
- OTP / `send-otp` Vitest (platform/config; §7).
- Handler 503 for schema-invalid JSON (Zod fail is proven at `parse-checkin`; unparsable text already 503s).
- Extra `payment-validation.test.ts` `"-1"` unit (handler 400 + no upsert is the “API booked it anyway” proof).
- Chained parse → save in one test (Phase 1 rule).
- Driving 11 real inserts instead of `count: 10` (queue mock is not a live counter).

## Implementation Approach

Extend colocated Vitest. **Parse no-write + quota first** (Risks #4 and #6 share `parse.test.ts`). **Invalid payload second** (Risk #5: schema unit, parse-checkin unit, save handler). **Cookbook last.**

Oracle: PRD FR-034–036, NFR “AI never written without structural + domain validation,” and backported §2 guidance — not a snapshot of current validator output.

Reuse `createApiContext({ json })` + `createSupabaseMock` + `mockAiRun`. Keep parse tests JSON; keep save tests FormData.

## Critical Implementation Details

`createSupabaseMock` records `from(table)` and later `insert` / `upsert` as separate calls. Quota asserts must look for **`method === "insert"` on `ai_checkin_requests`**, not merely `from("ai_checkin_requests")` — the rate-limit **count** already hits that table.

Parse queue order (existing tests): rate-limit count → (on deny) oldest row; (on allow) active goals → **then** `recordParseAttempt` (`queue({ error: null })`) → then `mockAiRun`. `INVALID_INPUT` returns before any rate-limit query. `NO_GOALS` returns after goals select, before insert. Do not add extra queue entries that cause underflow, and do not omit the insert queue on the 503 path.

Do not put AI on `createApiContext.locals`. `parse.ts` uses `env.AI` from `cloudflare:workers`.

---

## Phase 1: Parse no-write and quota (Risks #4, #6)

### Overview

Prove parse never records `goal_payments`, that 200 is not a save, that the 11th parse is 429 without AI or a new attempt row, that failed AI still burns quota, and that 429/503 carry the codes and manual-path copy the UI keys off.

### Changes Required:

#### 1. Parse never writes `goal_payments` (200 / 429 / 503)

**File**: `src/pages/api/check-in/parse.test.ts`

**Intent**: Lock the challenge “a 200 from parse means the month was recorded.” Failure and success parse paths must not upsert payments.

**Contract**: On the existing 200, 429, and 503 cases (or dedicated `it`s that reuse those queues), assert `mock.calls` has no `table === "goal_payments"` with `upsert` or `insert`. Local helper mirroring `paymentUpserts` in `check-in.test.ts` is fine; do not add it to `api-route.ts`.

**Behavior asserted**: Parse does not record a payment/month.

**Regression caught**: Someone wires parse to upsert `goal_payments` on success or on error recovery.

**Research source**: `research.md` Risk #4 — Parse never saves payments; Challenge #4.

**Edge/error/boundary**: Include 200 (happy proposals), 429 (cap reached), and 503 (model throw). `ai_checkin_requests` insert on 503 is allowed.

**Anti-pattern avoided**: E2e of the modal; treating any DB write as a failure (quota rows are expected on 503).

#### 2. 429 skips AI and does not insert an attempt

**File**: `src/pages/api/check-in/parse.test.ts`

**Intent**: A rate-limit table does not “mean the limit fires” unless the handler stops before the costly call and before burning another slot.

**Contract**: Existing count=10 queue. Assert 429, `code: "RATE_LIMITED"`, `mockAiRun` not called, and no `ai_checkin_requests` `insert`. Keep the existing oldest-row queue entry that `retryAfterMs` needs.

**Behavior asserted**: 11th parse (count ≥ 10) is denied with no AI and no extra quota row.

**Regression caught**: Check-then-insert inverted so a denied request still calls AI or inserts.

**Research source**: `research.md` Risk #6 — 11th request; cheapest layer items 1.

**Edge/error/boundary**: `count: 10` is the deny threshold (`used >= limit`). Do not mock the limiter to always allow.

**Anti-pattern avoided**: Mocking `checkRateLimit` to return ok; driving 11 sequential POSTs against a FIFO queue that is not a real counter.

#### 3. 503 still inserts `ai_checkin_requests`

**File**: `src/pages/api/check-in/parse.test.ts`

**Intent**: Failed AI consumes quota (insert-before-AI). Abuse via malformed prompts still counts.

**Contract**: On the existing model-throw 503 path (insert already queued), assert some call is `table === "ai_checkin_requests"` and `method === "insert"`. Still 503 `AI_UNAVAILABLE`.

**Behavior asserted**: Quota burns even when the model fails.

**Regression caught**: Moving `recordParseAttempt` to after a successful parse (failed AI becomes free).

**Research source**: `research.md` Risk #6 cheapest layer item 2; Risk #4 “nothing is written” refinement.

**Edge/error/boundary**: Use the throw path (already queued). Unparsable-text 503 uses the same insert-before-AI order — one of the two is enough if queues match.

**Anti-pattern avoided**: Asserting “zero DB writes” on 503.

#### 4. `INVALID_INPUT` and `NO_GOALS` do not insert

**File**: `src/pages/api/check-in/parse.test.ts`

**Intent**: Rejected empty/oversize input and users with no active goals must not consume the 10/hour budget.

**Contract**: Existing empty-text and `NO_GOALS` cases. Assert no `ai_checkin_requests` `insert`. Empty text may have zero Supabase calls; `NO_GOALS` may `from` the rate-limit table for **count** — that is not an insert.

**Behavior asserted**: Validation and no-goals exits are free.

**Regression caught**: Recording the attempt before `validateCheckInText` or before the active-goals check.

**Research source**: `research.md` Risk #6 cheapest layer item 3; S-04 insert-after-validation.

**Edge/error/boundary**: Both 400 codes. Oversize 501-char case is the same gate as empty — one `INVALID_INPUT` is enough if it returns before rate-limit.

**Anti-pattern avoided**: Treating `from("ai_checkin_requests")` as proof of a burned slot.

#### 5. 429 / 503 carry fallback codes and manual-path copy

**File**: `src/pages/api/check-in/parse.test.ts`

**Intent**: The UI keys `RATE_LIMITED` and `AI_UNAVAILABLE` and shows a Manual CTA from `error`. Handler copy is the cheapest lock of “manual path still available.”

**Contract**: Extend the existing 429 and 503 JSON asserts: `code` stays as today; `error` must mention the manual path (Polish “ręczn” is the stable stem in both handler strings). Do not add `AiCheckInTab` tests.

**Behavior asserted**: Client can distinguish fallback-worthy failures and is told to use manual check-in.

**Regression caught**: Status-only 429/503 with no `code`, or copy that drops the manual hint.

**Research source**: `research.md` Risk #4 error-code table; planning decision: handler codes + copy, no React.

**Edge/error/boundary**: Both codes. `INVALID_INPUT` / `NO_GOALS` must **not** be required to mention fallback (UI does not set `showFallback` for them).

**Anti-pattern avoided**: E2e of the modal; asserting exact full sentence snapshots that churn with retry-minute wording (stem / `code` is the contract).

### Success Criteria:

#### Automated Verification:

- Parse 200, 429, and 503 assert no `goal_payments` write
- 429 asserts no AI run and no attempt insert
- 503 asserts `ai_checkin_requests` insert
- `INVALID_INPUT` and `NO_GOALS` assert no attempt insert
- 429 and 503 JSON include `code` plus manual-path `error` copy
- `npm test` passes

#### Manual Verification:

- New `it` titles name no-write / quota / fallback — not “covers parse handler”

---

## Phase 2: Out-of-contract payload (Risk #5)

### Overview

Prove negative / malformed model JSON never becomes proposals, unmatched names stay out of the save form’s concern at parse time, and the save handler rejects junk amounts with no upsert. Oracle is FR-035 / FR-036, not current function snapshots.

### Changes Required:

#### 1. Schema fail-closed on negative and mixed amounts

**File**: `src/lib/goals/ai-checkin/parse-schema.test.ts`

**Intent**: Non-positive amounts are structural (whole payload `{ ok: false }`), not a per-item skip. Amount `0` is already covered; add negative and mixed.

**Contract**: `parseAiResponse({ payments: [{ goal_name: "Wakacje", amount: -1 }] })` → `{ ok: false }`. Mixed: one valid payment and one `amount: -1` in the same array → `{ ok: false }` (not a partial `data.payments`). Empty `goal_name` and `amount: 0` stay as existing cases.

**Behavior asserted**: One bad amount fail-closes the AI response (FR-036-shaped).

**Regression caught**: Switching to per-item drop (archived unshipped skip) or accepting negatives.

**Research source**: `research.md` Risk #5 Zod table; FR-035 vs live (stricter on amounts).

**Edge/error/boundary**: Negative; mixed valid+invalid. Do not assert extra junk fields policy unless it changes `{ ok: false }` vs ok.

**Anti-pattern avoided**: Snapshot of Zod issue paths as the oracle; asserting the unshipped per-item exclude.

#### 2. Orchestration maps Zod failure to `invalid_response`

**File**: `src/lib/goals/ai-checkin/parse-checkin.test.ts`

**Intent**: A JSON object that parses but fails the schema must not produce proposals.

**Contract**: `ai.run` resolves `{ response: JSON.stringify({ payments: [{ goal_name: "Wakacje", amount: -1 }] }) }` (or amount `0`). Result `{ ok: false, reason: "invalid_response" }`. Existing garbage-string and unmatched-name cases stay.

**Behavior asserted**: Schema-invalid model JSON is AI-unavailable at the library boundary, not a proposal list.

**Regression caught**: Catching only `JSON.parse` errors and passing raw objects into the match loop.

**Research source**: `research.md` Risk #5 cheapest layer item 2; `parse-checkin.ts` `parseAiResponse` branch.

**Edge/error/boundary**: Valid JSON + invalid schema (distinct from existing `"not json"` garbage).

**Anti-pattern avoided**: Chaining this into `POST /api/check-in`; handler 503 for this shape is out of scope (unparsable text already covers HTTP 503).

#### 3. Save rejects negative and malformed amounts with no upsert

**File**: `src/pages/api/check-in.test.ts`

**Intent**: Showing AI proposals is not “safe to save.” Persistence uses `parsePaymentAmount`. Junk must 400 and not write.

**Contract**: Authenticated POST, valid past `payment_month` (`2020-01`), owned `goal_id`, `amount: "-1"` → 400 and `paymentUpserts(mock)` empty (do not queue a successful upsert). Second `it`: non-numeric amount (e.g. `"abc"`) → 400, zero upserts. Do not send `goal_name`. Explicit `"0"` remains allowed (existing test).

**Behavior asserted**: Save layer rejects out-of-contract amounts independently of parse.

**Regression caught**: Handler skips `parsePaymentAmount` or upserts before the 400.

**Research source**: `research.md` Risk #5 client-can-POST-junk; cheapest layer item 3.

**Edge/error/boundary**: `"-1"` (regex, not `>= 0` after parseFloat); one malformed string. Skip extra `payment-validation.test.ts` case.

**Anti-pattern avoided**: Implementation mirror of the regex; treating save `"0"` as a failure (FR-015).

### Success Criteria:

#### Automated Verification:

- `parseAiResponse` rejects negative and mixed-array payloads with `{ ok: false }`
- `parseCheckInSentence` returns `invalid_response` for schema-invalid JSON
- `POST /api/check-in` with `"-1"` and with a malformed amount returns 400 and zero `goal_payments` upserts
- `npm test` passes

#### Manual Verification:

- New `it` titles cite fail-closed / save rejects junk — not “matches current Zod output”

---

## Phase 3: Cookbook backport

### Overview

Fill `context/foundation/test-plan.md` §6.5 with the patterns this phase shipped, add a §6.6 Phase 3 note, and name OTP app limiting in §7. Do not add file anchors to §1/§2 (already backported). Mark §3 Phase 3 `complete`.

### Changes Required:

#### 1. §6.5 AI failure / invalid payload cookbook

**File**: `context/foundation/test-plan.md` (§6.5)

**Intent**: Replace the TBD stub with how to add tests for parse fallback, no-write, quota, and invalid payloads.

**Contract**: Location (colocated `parse.test.ts` / `parse-schema.test.ts` / `parse-checkin.test.ts` / `check-in.test.ts`). Harness: `json` + `mockAiRun` for parse; FormData for save. Assert `mock.calls` for no `goal_payments` and for insert vs count on `ai_checkin_requests`. 200 parse ≠ save. Codes `RATE_LIMITED` / `AI_UNAVAILABLE` + manual-path copy. Zod fail-closed amounts; unmatched names are not save inputs; save `"-1"` → 400. Oracle FR-034–036. Anti-patterns: modal e2e, validator snapshot, limiter always-allow, parse+save chain. OTP: do not test here.

#### 2. §6.6 Phase 3 note and §7 OTP negative space

**File**: `context/foundation/test-plan.md` (§6.6, §7)

**Intent**: Record what shipped; make OTP-without-app-limiter an explicit don’t-test until an app-owned counter exists.

**Contract**: §6.6 bullet for `testing-ai-safety-path` listing the parse no-write/quota cases and the schema/save junk cases. §7 new bullet: OTP send loop is platform/config (`config.toml`), not Vitest in this rollout — re-evaluate if a production mail flood lands. Do not rewrite §1/§2.

#### 3. §3 Phase 3 status

**File**: `context/foundation/test-plan.md` (§3)

**Intent**: Orchestrator can advance to Phase 4 on the next `/10x-test-plan` run.

**Contract**: Phase 3 Status → `complete`. Change folder stays `testing-ai-safety-path`. Last updated date = implement day.

### Success Criteria:

#### Automated Verification:

- `npm test` still passes after cookbook-only edits

#### Manual Verification:

- §6.5 / §6.6 / §7 match the tests that shipped (no file anchors in §1/§2)
- §3 Phase 3 Status is `complete`

---

## Testing Strategy

### Unit Tests:

- `parseAiResponse` negative + mixed fail-closed (FR-036).
- `parseCheckInSentence` schema-invalid JSON → `invalid_response`.

### Integration Tests:

- `POST /api/check-in/parse`: no `goal_payments`; 429 no AI/insert; 503 insert; 400s no insert; codes + manual copy.
- `POST /api/check-in`: `"-1"` / malformed → 400, zero upserts.

### Manual Testing Steps:

1. Read new `it` titles — they should name the failure mode.
2. Confirm §6.5 is usable as a recipe without opening this plan.

## Performance Considerations

None. In-process Vitest against the existing queue mock.

## Migration Notes

None. Test-only change.

## References

- Related research: `context/changes/testing-ai-safety-path/research.md`
- Test plan: `context/foundation/test-plan.md` — Risks #4–#6, §3 Phase 3, §6.5 TBD
- Similar implementation: `context/archive/2026-09-03-testing-critical-path-coverage/plan.md`
- Isolation research (parse not IDOR): `context/changes/testing-isolation-and-abuse/research.md`
- Harness: `src/test/api-route.ts`, `src/test/vitest-mocks.ts`
- Archive S-04: `context/archive/2026-06-23-ai-checkin-safety/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parse no-write and quota (Risks #4, #6)

#### Automated

- [x] 1.1 Parse 200, 429, and 503 assert no goal_payments write
- [x] 1.2 429 asserts no AI run and no attempt insert
- [x] 1.3 503 asserts ai_checkin_requests insert
- [x] 1.4 INVALID_INPUT and NO_GOALS assert no attempt insert
- [x] 1.5 429 and 503 JSON include code plus manual-path error copy
- [x] 1.6 npm test passes after parse no-write and quota cases

#### Manual

- [x] 1.7 New it titles name no-write / quota / fallback — not “covers parse handler”

### Phase 2: Out-of-contract payload (Risk #5)

#### Automated

- [ ] 2.1 parseAiResponse rejects negative and mixed-array payloads with { ok: false }
- [ ] 2.2 parseCheckInSentence returns invalid_response for schema-invalid JSON
- [ ] 2.3 POST /api/check-in with "-1" and with a malformed amount returns 400 and zero goal_payments upserts
- [ ] 2.4 npm test passes after invalid-payload cases

#### Manual

- [ ] 2.5 New it titles cite fail-closed / save rejects junk — not “matches current Zod output”

### Phase 3: Cookbook backport

#### Automated

- [ ] 3.1 npm test still passes after cookbook-only edits

#### Manual

- [ ] 3.2 §6.5 / §6.6 / §7 match the tests that shipped (no file anchors in §1/§2)
- [ ] 3.3 §3 Phase 3 Status is complete
