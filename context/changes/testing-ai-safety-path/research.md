---
date: 2026-09-07T13:15:07+02:00
researcher: Grok
git_commit: 5ff51f93f83c4bfc94c4652f2f568052dfee2e6a
branch: main
repository: kapaminska/saved
topic: "Rollout Phase 3 — AI safety path (Risks #4, #5, #6)"
tags: [research, testing, ai-checkin, parse, rate-limit, fallback, vitest]
status: complete
last_updated: 2026-09-07
last_updated_by: Grok
---

# Research: Rollout Phase 3 — AI safety path (Risks #4, #5, #6)

**Date**: 2026-09-07T13:15:07+02:00
**Researcher**: Grok
**Git Commit**: [5ff51f93f83c4bfc94c4652f2f568052dfee2e6a](https://github.com/kapaminska/saved/commit/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a)
**Branch**: main
**Repository**: kapaminska/saved

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md`.

Risks to verify: **#4, #5, #6** from §2.

Risk response guidance to verify, not blindly accept:

- **#4**: prove AI error / timeout / 503 still offers a working manual path and nothing is written; challenge "a 200 from parse means the month was recorded"; avoid e2e of the modal.
- **#5**: prove negative / unmatched / malformed AI payload never becomes a payment row; challenge "showing proposals means they are safe to save"; avoid snapshot of current validator output as the oracle.
- **#6**: prove the 11th parse in the window is denied with a fallback signal, and brute OTP does not multiply side effects unchecked; challenge "a rate-limit table means the limit fires"; avoid mocking the limiter to always allow.

The test plan carries evidence and response intent, not code anchors. Ground the real failure path, quote relevant lines, verify or correct the response guidance, locate existing tests, identify the cheapest useful test layer, and flag speculative risks or misleading hot-spot evidence.

## Summary

**The safeguards already exist. The gap is proof, not a missing fallback.** Parse is proposal-only. The month is recorded only by `POST /api/check-in`. Malformed or non-positive model JSON fail-closes as 503. Unmatched names never enter the save form. The 11th parse in a 10/hour per-user window is 429 `RATE_LIMITED` with a Manual-tab CTA. OTP has **no app-level limiter** — defer it; do not spend Phase 3 Vitest on Auth.

**Challenge #4 is already disproved by design:** HTTP 200 from parse returns `proposals` / `unrecognized` / `rateLimitRemaining`. It does not upsert `goal_payments`. Residual wording: “nothing is written” is too strong — `ai_checkin_requests` inserts **before** the AI call, including on later 503. There is **no app-level timeout**; a hung model surfaces as the UI `fetch` `catch` (same fallback CTA), not a first-class 503.

**Challenge #5 holds as a planning constraint:** review display is not persistence. Save uses editable `goal_id` + `amount` form fields and `parsePaymentAmount`. Archived “skip amount ≤ 0 after Zod” **did not ship**; amounts `≤ 0` fail the **whole** Zod payload (stricter than FR-035’s per-item exclude). Oracle: PRD FR-035 / FR-036 / NFR “AI never written without structural + domain validation” — not a snapshot of current matcher output.

**Challenge #6 is valid for parse, overstated for OTP.** Existing `parse.test.ts` already returns 429 when count=10. It does **not** assert zero payment writes, insert-before-AI on 503, or no insert on 400/429. OTP send is a comment pointing at `supabase/config.toml`; a bot can loop the handler. §7 already parks OTP e2e.

**Cheapest useful layer:** extend colocated Vitest already in place (`parse.test.ts`, `parse-schema.test.ts`, `parse-checkin.test.ts`, `check-in.test.ts`). Mock AI via `mockAiRun` (`src/test/vitest-mocks.ts`), not `locals.runtime`. **Do not add Playwright, MSW, or a fake OTP limiter.**

**Hot-spot:** §2 sources for #4–#6 are PRD + archive S-04 / S-01, not churn directories. Live surface is the AI parse stack under `src/lib/goals/ai-checkin/` and `src/pages/api/check-in/` — likelihood evidence, not a correction that the Source column was wrong. Risks are **not speculative**; they are implemented guardrails without lock-in tests for the failure modes that matter.

## Detailed Findings

### Risk #4 — AI unavailable must not block the month

#### Failure path

1. Dashboard modal defaults to the AI tab; month state is shared with Manual (`CheckInModal`).
2. AI tab `POST /api/check-in/parse` with `{ text }` only — no month, no amounts.
3. Handler: auth → validate text → rate limit → load active goals → **`recordParseAttempt`** → `parseCheckInSentence(env.AI, …)`.
4. AI throw / empty response / bad JSON / Zod fail → **503 `AI_UNAVAILABLE`**. Rate limit → **429 `RATE_LIMITED`**. Neither path upserts `goal_payments`.
5. UI: those codes (and network `catch`) set `showFallback` → “Przełącz na ręczny check-in” → Manual tab. The Manual tab is always clickable anyway.
6. Manual submit (and AI review save) both `POST /api/check-in` — **that** records the month.

#### Parse never saves payments

[`src/pages/api/check-in/parse.ts`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/pages/api/check-in/parse.ts#L13-L88) is the only parse entry. Success body is proposals, not a payment write:

```83:88:src/pages/api/check-in/parse.ts
  return jsonResponse({
    success: true,
    proposals: parseResult.proposals,
    unrecognized: parseResult.unrecognized,
    rateLimitRemaining: rateLimitResult.remaining,
  });
```

Payment upsert lives only on the save handler:

```82:90:src/pages/api/check-in.ts
  for (const entry of entries) {
    const { error: upsertError } = await supabase.from("goal_payments").upsert(
      {
        goal_id: entry.goalId,
        user_id: user.id,
        amount: entry.amount,
        payment_month: monthResult.paymentMonth,
      },
      { onConflict: "goal_id,payment_month" },
    );
```

**200 from parse does not mean the month was recorded.** Challenge #4 is false as a product claim; tests should lock that by asserting `mock.calls` has **no** `goal_payments` upsert on 200 / 429 / 503.

#### Error codes the UI keys off

| Condition | Status | `code` | UI fallback CTA |
|-----------|--------|--------|-----------------|
| Unauthenticated | 401 | (none) | n/a |
| Bad/empty/>500 text | 400 | `INVALID_INPUT` | No (inline) |
| Count ≥ 10 | 429 | `RATE_LIMITED` | Yes |
| Zero active goals | 400 | `NO_GOALS` | No (`showFallback` unset; tabs still exist) |
| `ai.run` throw / invalid JSON / Zod fail | 503 | `AI_UNAVAILABLE` | Yes |
| Network / `res.json` throw | — | — | Yes (`catch`) |

```101:120:src/components/goals/AiCheckInTab.tsx
      if (!json.success) {
        if (json.code === "INVALID_INPUT") {
          setInputError(json.error ?? "Nieprawidłowy tekst check-inu");
          return;
        }
        if (json.code === "RATE_LIMITED" || json.code === "AI_UNAVAILABLE") {
          setServerError(json.error ?? "Check-in AI jest niedostępny");
          setShowFallback(true);
          return;
        }
        setServerError(json.error ?? "Nie udało się przeanalizować check-inu");
        return;
      }
      // ...
    } catch {
      setServerError("Błąd sieci. Spróbuj ponownie.");
      setShowFallback(true);
    }
```

Manual path independence: `handleSwitchToManual` only flips the tab (`CheckInModal.tsx:40-43`). Manual submit posts the same `/api/check-in` form as S-03, with the shared `month`.

Archived S-04 planned an explicit missing-`AI` binding check. **Shipped code has none.** `parse.ts` always calls `parseCheckInSentence(env.AI, …)`. A missing/broken binding throws inside `ai.run` → `ai_error` → still 503. No extra branch to test.

**Timeout:** `parseCheckInSentence` has no `AbortSignal` / `Promise.race`. Guidance that names “timeout” as a first-class 503 is **wrong**. Hang → Worker/request limit → client `catch` → same CTA.

#### “Nothing is written” — refine

`recordParseAttempt` runs **after** validation + rate-limit pass + active goals, **before** AI:

```65:71:src/pages/api/check-in/parse.ts
  try {
    await recordParseAttempt(supabase, user.id);
  } catch {
    return jsonResponse({ success: false, error: "Nie udało się zapisać próby parsowania" }, 500);
  }

  const parseResult = await parseCheckInSentence(env.AI, textResult.text, activeGoals);
```

Failed AI **still consumes quota**. Prove “month not recorded,” not “zero DB writes.”

#### Existing tests vs gap

[`src/pages/api/check-in/parse.test.ts`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/pages/api/check-in/parse.test.ts) already covers 401, `INVALID_INPUT`, 429, `NO_GOALS`, 503 on throw and unparsable text, 200 happy proposals. It **never inspects `mock.calls` for `goal_payments`**. [`parse-checkin.test.ts`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/lib/goals/ai-checkin/parse-checkin.test.ts) covers match/unrecognized, fenced JSON, `invalid_response`, `ai_error`. **No `AiCheckInTab` / `CheckInModal` tests.**

#### Cheapest layer

1. **Handler integration** — extend `parse.test.ts`: on 503 / 429 / 200, assert no `goal_payments` upsert/insert in `mock.calls`. Optionally assert 503 error string mentions manual path.
2. **Do not** e2e the modal. Manual save is already proven in `check-in.test.ts` (Phase 1). Fallback CTA is a code→`showFallback` mapping; a component test is optional and lower value than no-write assertions.
3. Do not invent an app timeout test.

#### Response-guidance verdict

Keep the challenge and the anti-pattern (no modal e2e). **Correct** “nothing is written” → no `goal_payments` / month not recorded (`ai_checkin_requests` may insert). **Correct** “timeout” → AI error / invalid response / 503, plus client network failure as the hang stand-in.

---

### Risk #5 — Out-of-contract AI payload must not persist

#### Failure path

```
Workers AI text
  → JSON extract
  → parseAiResponse / Zod          [FR-036; amounts > 0 here]
  → matchGoalName per item         [FR-035 names]
  → { proposals, unrecognized }
  → review UI (editable; unrecognized display-only)
  → FormData payment_month + goal_id[] + amount[]
  → POST /api/check-in → parsePaymentAmount + owned active UUID → upsert
```

#### Structural vs domain

Zod is fail-closed for the **whole** payload. Amount `gt(0)` is structural, not a per-item skip:

```3:19:src/lib/goals/ai-checkin/parse-schema.ts
export const AiParseResponseSchema = z.object({
  payments: z.array(
    z.object({
      goal_name: z.string().min(1),
      amount: z.coerce.number().gt(0),
    }),
  ),
});
```

`parseAiResponse` `{ ok: false }` → `invalid_response` → handler 503 `AI_UNAVAILABLE` ([`parse-checkin.ts:106-108`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/lib/goals/ai-checkin/parse-checkin.ts#L106-L108), [`parse.ts:71-80`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/pages/api/check-in/parse.ts#L71-L80)).

Live loop after Zod is **name match only**. Archived S-04 “if amount ≤ 0, skip silently” **is not in** `parse-checkin.ts`:

```114:130:src/lib/goals/ai-checkin/parse-checkin.ts
    for (const payment of parsed.data.payments) {
      const match = matchGoalName(payment.goal_name, activeGoals);
      if (match.kind === "matched") {
        proposals.push({ /* ... */ });
        continue;
      }
      unrecognized.push({
        rawGoalName: payment.goal_name,
        amount: payment.amount,
      });
    }
```

Unmatched / ambiguous names → `unrecognized` (FR-014). They are **not** appended on save:

```138:148:src/components/goals/AiCheckInTab.tsx
    const body = new URLSearchParams();
    body.set("payment_month", month);
    // ...
    for (const proposal of reviewProposals) {
      const amountRaw = proposal.amount.trim();
      if (!amountRaw) continue;
      body.append("goal_id", proposal.goalId);
      body.append("amount", amountRaw);
```

`createReviewProposals` maps **proposals only** (`AiCheckInTab.tsx:52-57`). Save never sends `goal_name` or raw model JSON.

#### Client can still POST junk (by design)

`POST /api/check-in` does not re-run AI validation. It accepts form UUIDs + `parsePaymentAmount`:

```16:27:src/lib/goals/payment-validation.ts
export function parsePaymentAmount(value: string | null): ... {
  // ...
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: "Kwota wpłaty musi być liczbą z maksymalnie 2 miejscami po przecinku" };
  }
```

`-1` / letters fail the regex → 400, no upsert. `"0"` is **allowed** on save (FR-015 explicit zero) — out of contract for **AI proposals**, in contract for check-in. Challenge “shown ⇒ safe to save” is the right planning constraint: safety on persist is the save layer, not the review list.

#### FR-035 vs live (oracle)

PRD FR-035: failing amounts **or** names are **excluded from the review screen**. Live: unmatched names match that; non-positive amounts fail **FR-036** (whole response unavailable). Mixed good+bad amounts therefore never show the good ones. That is **stricter**, not a missing safeguard. Do not assert the unshipped per-item skip. Oracle remains PRD FR-035/036 + NFR line 164, not `parseAiResponse` snapshots of current fixtures.

#### Existing tests vs gap

| File | Has | Missing for #5 |
|------|-----|----------------|
| `parse-schema.test.ts` | positive, coerce string, `{}`, empty name, **amount 0** | explicit **negative**; mixed valid+invalid array fail-closed |
| `parse-checkin.test.ts` | unmatched → unrecognized; garbage → `invalid_response` | Zod-fail object (parses as JSON, fails schema) → `invalid_response` |
| `parse.test.ts` | unparsable text → 503 | schema-invalid JSON object → 503 |
| `check-in.test.ts` | UUID save, zero/skip (Phase 1) | **negative / malformed amount → 400 + no upsert** |
| `payment-validation.test.ts` | `>= 0` shape | `"-1"` (regex path) |

#### Cheapest layer

1. **Unit** `parseAiResponse`: negative / mixed array → `{ ok: false }` (oracle: positive amount + FR-036 fail-closed).
2. **Unit** `parseCheckInSentence`: schema-fail JSON → `invalid_response`; unmatched stays in `unrecognized` only.
3. **Integration** `POST /api/check-in`: `amount: "-1"` (and one malformed string) → 400, **zero upserts**. Proves save ignores invalid independently of parse.

Avoid asserting `matchGoalName` output against itself (Phase 1 already owns adversarial names). Avoid modal e2e of review.

#### Response-guidance verdict

Keep the challenge and the anti-pattern. **Correct** implied “domain skip ≤ 0” — not implemented. **Note** save allows 0 (manual FR-015). Likely cheapest layer confirmed: unit schema/domain + integration save rejects junk.

---

### Risk #6 — Parse/OTP loop without a fallback signal

#### Parse: 11th request is the deny

Defaults: **10 / 3_600_000 ms / `user_id`** ([`rate-limit.ts:3-18`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/lib/goals/ai-checkin/rate-limit.ts#L3-L18)). `used >= 10` → deny. Handler maps that to **429 `RATE_LIMITED`** with copy that names the 10/hour limit and the manual path ([`parse.ts:38-48`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/pages/api/check-in/parse.ts#L38-L48)).

Insert is **after** `checkRateLimit` pass and **before** AI. Invalid input and `NO_GOALS` do **not** consume quota. Count-query errors fail closed (`ok: false`). Check-then-insert is not atomic (archive impl-review); sequential traffic is what tests can honestly prove.

Existing [`parse.test.ts:41-48`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/pages/api/check-in/parse.test.ts#L41-L48) already forces `count: 10` → 429 + `RATE_LIMITED`. That **challenges** “a table means the limit fires” rather than mocking the limiter to always allow. Gaps: no assert that 429 skips `recordParseAttempt` and `mockAiRun`; no assert that 503 still inserts; no assert that 400 paths do not insert.

UI fallback for `RATE_LIMITED` is the same `showFallback` branch as Risk #4 — do not duplicate a component test.

#### OTP: real unenforced app surface — defer

[`src/pages/api/auth/send-otp.ts:23-24`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/pages/api/auth/send-otp.ts#L23-L24):

```23:24:src/pages/api/auth/send-otp.ts
  // Rate limiting: Supabase enforces project-level OTP rate limits (see supabase/config.toml [auth] section)
  const { error } = await supabase.auth.signInWithOtp({ email });
```

No app counter. Client 60s cooldown in `MagicLinkForm` is bypassable. S-01 F7 was closed by **documenting** the dependency, not adding an edge limiter. Local [`supabase/config.toml`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/supabase/config.toml#L180-L217) `[auth.rate_limit] email_sent = 2` notes SMTP must be enabled; `max_frequency = "1s"`. Hosted prod may diverge. **No `send-otp` Vitest.**

Proving “brute OTP does not multiply side effects” in this rollout would mean inventing a fake Auth limiter or standing up live Supabase Auth — both fail cost × signal. Align with §7 (OTP e2e is negative space). Phase 3 owns **parse 11th + fallback code**, not OTP.

#### Cheapest layer

1. Keep / slightly strengthen **handler** 429 at count=10: `RATE_LIMITED`, **no AI run**, **no `goal_payments`**, **no insert** after the deny.
2. On 503 path: assert `ai_checkin_requests` insert was queued (failed AI burns quota).
3. On `INVALID_INPUT` / `NO_GOALS`: assert no insert.
4. Unit `rate-limit.test.ts` already covers under-limit remaining, at-limit `retryAfterMs`, count error fail-closed — enough for the helper.

Do not mock the limiter to always allow. Do not add OTP tests in this phase.

#### Response-guidance verdict

Keep “11th parse denied with fallback signal” and the parse challenge. **Soften or split OTP** — app does not enforce it; platform/config may. Do not treat OTP as co-equal Vitest proof with parse.

---

### Existing tests and harness

**23** `*.test.ts` files. Parse already has a colocated handler test.

AI is **not** on `createApiContext.locals`. Production parse uses `import { env } from "cloudflare:workers"`; tests mock that module:

```14:19:src/test/vitest-mocks.ts
vi.mock("cloudflare:workers", () => ({
  env: {
    AI: {
      run: hoistedAiRun,
    },
  },
}));
```

`createApiContext` already supports `json` (parse) vs `FormData` (check-in) ([`api-route.ts:43-90`](https://github.com/kapaminska/saved/blob/5ff51f93f83c4bfc94c4652f2f568052dfee2e6a/src/test/api-route.ts#L43-L90)). Reuse it. Do not add `runtime.env.AI` to the harness. Do not add MSW.

#### Recommended file layout (Phase 3)

```
src/pages/api/check-in/parse.test.ts          # #4 + #6 — no payment write; 429 skips AI/insert; 503 still inserts
src/lib/goals/ai-checkin/parse-schema.test.ts # #5 — negative; mixed array fail-closed
src/lib/goals/ai-checkin/parse-checkin.test.ts # #5 — schema-fail JSON → invalid_response
src/pages/api/check-in.test.ts                # #5 — amount "-1" / malformed → 400, zero upserts
src/lib/goals/payment-validation.test.ts      # optional thin "-1"
```

Keep parse vs save **decoupled** (Phase 1 rule). Do not chain `parse` → `check-in` in one test.

## Code References

- `src/pages/api/check-in/parse.ts:13-88` — parse handler: codes, insert-before-AI, 200 proposals only
- `src/pages/api/check-in.ts:26-90` — save: form `goal_id`/`amount`, `parsePaymentAmount`, `goal_payments` upsert
- `src/lib/goals/ai-checkin/parse-checkin.ts:78-135` — `ai_error` / `invalid_response`; match loop; no ≤0 skip
- `src/lib/goals/ai-checkin/parse-schema.ts:3-19` — Zod `amount.gt(0)`, empty name invalid
- `src/lib/goals/ai-checkin/rate-limit.ts:3-50` — 10/hour per `user_id`; `recordParseAttempt`
- `src/lib/goals/payment-validation.ts:16-27` — save amounts: regex, `>= 0`
- `src/components/goals/AiCheckInTab.tsx:101-120` — `RATE_LIMITED` / `AI_UNAVAILABLE` / network → fallback
- `src/components/goals/AiCheckInTab.tsx:134-161` — review save posts form to `/api/check-in`, not raw AI
- `src/components/goals/CheckInModal.tsx:21-43` — shared month; always-available Manual tab
- `src/pages/api/auth/send-otp.ts:23-24` — no app rate limit; comment only
- `src/test/vitest-mocks.ts:14-19` — `mockAiRun` for parse tests
- `src/test/api-route.ts:43-90` — json vs FormData; no `runtime.env.AI`
- `src/pages/api/check-in/parse.test.ts` — existing 401/400/429/503/200; no `mock.calls` payment asserts
- `supabase/config.toml:180-217` — Auth rate-limit config (OTP platform, not app)

## Architecture Insights

- **Parse is read-only for money.** The only parse-side writes are `ai_checkin_requests` (quota) and a `savings_goals` select. Treating parse 200 as a save is the bug the suite must refuse to encode.
- **Two validation stacks, on purpose.** AI contract (positive amounts, matched names, Zod object) is **not** the check-in contract (UUID + `>= 0`, explicit zero). Tests must not collapse them.
- **Fail-closed amounts, fail-open names.** One bad amount poisons the whole model response (503). One unknown name becomes unrecognized and the rest can still review. Do not write a test that expects per-item amount exclusion.
- **Quota attribution before the costly call.** Empty/oversize input is free; a 503 still costs a slot. That is the abuse-control design, not a leak to “fix” in tests.
- **UI islands stay out of `npm test`.** Error `code` strings are the contract the UI keys off. Handler tests on those codes are the cheapest lock; React fallback is optional.

## Historical Context (from prior changes)

- `context/archive/2026-06-23-ai-checkin-safety/plan.md` — S-04: parse never writes payments; 11th parse → rate limit + manual fallback; Zod + fuzzy match; MVP **explicitly skipped** a test framework (manual verification only). Several of those manuals are now untested regressions waiting to happen.
- Same plan: “if amount ≤ 0, skip silently” in orchestration vs Zod `> 0` — **only Zod shipped**. Do not revive the skip as the oracle.
- `context/archive/2026-06-11-auth-onboarding-profile/reviews/impl-review.md` (F7) — OTP rate limit closed as a **comment**, not an app limiter.
- `context/archive/2026-09-03-testing-critical-path-coverage/` — Phase 1 locked assignment + month integrity on **save** and adversarial `matchGoalName`. Explicitly deferred #4–#6; parse and save stay decoupled tests.
- `context/changes/testing-isolation-and-abuse/research.md` — parse is not a write-IDOR surface (no foreign UUID input); `ai_checkin_requests` belongs to Risk #6.

## Related Research

- `context/changes/testing-isolation-and-abuse/research.md` — Phase 2 ownership; parse out of Risk #3
- `context/archive/2026-09-03-testing-critical-path-coverage/research.md` — Phase 1; deferred AI safety

## Open Questions

None that block `/10x-plan`. OTP remains a platform-owned residual; revisit only if a production mail flood lands, via an **app-owned** counter — not by mocking `signInWithOtp`.

## Test-plan corrections (backport candidates)

Response-guidance / wording only — **no file anchors**. Ask before editing §2:

1. **#4 “nothing is written”** → no `goal_payments` / month not recorded; `ai_checkin_requests` may still insert before AI (including 503).
2. **#4 “timeout”** → not a first-class 503; hang is client network fallback.
3. **#5** → do not imply a post-Zod skip of `amount ≤ 0`; amounts fail-close the whole payload (FR-036-shaped). Save still allows `0` (FR-015).
4. **#6 OTP** → app does not enforce a send limiter; Phase 3 proof is parse 11th + `RATE_LIMITED` fallback, not OTP Vitest.

Hot-spot Source columns for #4–#6 (PRD + archive) are **not misleading**. Risks are **not speculative** — do not drop them.
