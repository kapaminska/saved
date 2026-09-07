---
date: 2026-09-04T15:10:00+02:00
researcher: Grok
git_commit: b515f8331b1ad66ec30ae23c97ebd39824820428
branch: main
repository: kapaminska/saved
topic: "Rollout Phase 2 — Isolation and abuse (Risk #3)"
tags: [research, testing, isolation, idor, rls, ownership, vitest]
status: complete
last_updated: 2026-09-04
last_updated_by: Grok
---

# Research: Rollout Phase 2 — Isolation and abuse (Risk #3)

**Date**: 2026-09-04T15:10:00+02:00
**Researcher**: Grok
**Git Commit**: [b515f8331b1ad66ec30ae23c97ebd39824820428](https://github.com/kapaminska/saved/commit/b515f8331b1ad66ec30ae23c97ebd39824820428)
**Branch**: main
**Repository**: kapaminska/saved

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` for Risk #3:

- Authenticated user A can read or mutate user B’s goals, payments, or net worth.
- Prove User B gets empty/404 on user A’s ids — read and write — for goals, payments, assets.
- Challenge “being logged in is enough”; avoid testing only 401 when logged out.

The test plan carries evidence and response intent, not code anchors. Ground the real failure path, quote relevant lines, verify or correct the response guidance, locate existing tests, identify the cheapest useful test layer, and flag speculative risks or misleading hot-spot evidence.

## Summary

**Risk #3 is a real regression surface, not an active leak.** Every money-touching API and SSR loader already authenticates via `locals.user` and scopes by **session `user.id`**, never a client-supplied `user_id`. Foreign resource UUIDs return **HTTP 404** (pages redirect to `/dashboard`). Middleware is **auth-only for pages** and does not gate `/api/*`. RLS policies on all six user-data tables use `auth.uid() = user_id` (or `= id` on profiles) with UPDATE `WITH CHECK`. The client is the cookie SSR + **anon** key, so RLS applies.

**The gap is proof, not the safeguard.** Vitest today only asserts **401 when logged out**. “Goal missing → 404” cases queue empty data and never inspect `mock.calls` for `.eq("user_id", …)`. The queue mock **does not simulate RLS**. Dropping the ownership filter would still leave those tests green. Assets and liabilities handlers have **zero** Vitest files. Five SQL RLS scripts exist and do Alice/Bob isolation, but they are **manual `psql`**, not in `npm test` or GitHub Actions.

**Cheapest useful layer:** extend the existing handler harness (`createApiContext` + `createSupabaseMock`) with **logged-in User B + User A’s UUID**, asserting both (1) `mock.calls` contains `.eq("user_id", bobId)` on load/mutate and (2) 404 / no owner-blind mutate. That is the only way this mock can prove ownership. Cover goals, payments (including check-in with a foreign `goal_id`), **and** assets/liabilities (net worth). Optionally unit-test `getGoalDetailPageData` for the SSR redirect. **Do not add Playwright. Do not treat 401 as the isolation test.**

**SQL RLS in CI is complementary, not the HTTP-404 proof.** Policies are the DB hard stop; 404 is app interpretation of an empty owned-row fetch. Prior slices deliberately kept `supabase/tests/` out of `npm test` (Docker). Phase 2 should **choose API ownership as the CI isolation proof** Phase 4 locks. Wiring the five `psql` scripts is a separate, costlier gate — valuable against “RLS disabled in a migration,” not required to prove the product 404 claim, and poorly justified by `supabase/` quiescence.

**Hot-spot correction:** `supabase/` **0 commits / 30d is confirmed** (last touch 2026-06-23, net-worth RLS). That is a **stable baseline**, not evidence of untested drift. Likelihood for Risk #3 is better sourced as: PRD isolation NFR + abuse/IDOR lens + **no automated cross-user proof in CI**. Recent `src/` churn is almost entirely new tests, not ownership edits.

**Response-guidance corrections:** “empty/404” mixes two layers (RLS → empty/0-row; app → 404). “Being logged in is enough” is the right challenge — and is exactly what the current suite tests. Likely cheapest layer is **Vitest API ownership**, not “SQL RLS in the JS/CI loop” as primary.

## Detailed Findings

### Auth vs ownership (two different gates)

#### Middleware is authentication for pages, not ownership, and not APIs

[`src/middleware.ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/middleware.ts#L4-L48) sets `locals.user` / `locals.supabase` on every request, then redirects unauthenticated browsers away from `/dashboard`, `/onboarding`, `/profile`, `/goals*`. **`/api/*` is not in `PROTECTED_ROUTES`.** Each handler must 401 itself. There is no resource-id check here.

```4:48:src/middleware.ts
const PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/profile", "/goals"];
// ...
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
// ...
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
```

A test that only hits an API without `locals.user` and expects 401 proves this auth gate (or the handler’s copy of it). It does **not** prove User B cannot touch User A’s row.

#### Supabase client is user-scoped (RLS applies)

[`src/lib/supabase.ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/supabase.ts#L44-L58) builds `@supabase/ssr` `createServerClient` with `SUPABASE_KEY`. README: that key is the **anon** key from the CLI, not `service_role`. Cookie session → `auth.uid()` in RLS. There is no admin/service-role client in app code.

Residual (config, not a code bug): if production ever set `SUPABASE_KEY` to the service role, RLS would be bypassed and isolation would rest entirely on app `.eq("user_id", …)`.

### App-layer failure path (where IDOR would actually fire)

There are **no GET list/detail APIs** for money data. Reads are SSR. Writes are `POST` handlers. The IDOR vector is: **logged-in B supplies A’s UUID in the URL or form**.

Every ID-scoped money handler uses the same pattern: 401 if no `locals.user` → load `.eq("id", …).eq("user_id", user.id)` → **404 if missing** → mutate with the same `user_id` predicate. Creates stamp `user_id: user.id` from the session. Bodies never accept an owner field.

#### Goals

[`src/pages/api/goals/[id].ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D.ts#L20-L44) — edit:

```36:44:src/pages/api/goals/[id].ts
  const { data: existing, error: fetchError } = await supabase
    .from("savings_goals")
    .select()
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Nie znaleziono celu" }, 404);
  }
```

Update repeats `.eq("user_id", user.id)` ([L98–102](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D.ts#L98-L102)). Abandon uses the same load+404 ([`abandon.ts` L29–37](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D/abandon.ts#L29-L37)). Create inserts `user_id: user.id` ([`goals/index.ts` L50–53](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/index.ts#L50-L53)).

#### Payments (nested resource)

Edit and delete load **goal then payment**, both with `user_id`:

```32:56:src/pages/api/goals/[id]/payments/[paymentId].ts
  const { data: goal, error: goalError } = await supabase
    .from("savings_goals")
    .select("id, status")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  // ...
  const { data: payment, error: paymentError } = await supabase
    .from("goal_payments")
    .select("id, payment_month")
    .eq("id", paymentId)
    .eq("goal_id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (paymentError || !payment) {
    return jsonResponse({ success: false, error: "Nie znaleziono wpłaty" }, 404);
  }
```

Delete: [`…/delete.ts` L31–63](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D/payments/%5BpaymentId%5D/delete.ts#L31-L63).

**Check-in** is the important write that takes **client `goal_id`s**:

```68:90:src/pages/api/check-in.ts
  const { data: goals, error: goalsError } = await supabase
    .from("savings_goals")
    .select("id, name, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("id", uniqueGoalIds);

  if (goalsError || goals.length !== uniqueGoalIds.length) {
    return jsonResponse({ success: false, error: "Nie znaleziono co najmniej jednego aktywnego celu" }, 404);
  }
  // ...
        user_id: user.id,
```

If this batch ownership check is dropped, B can upsert a payment onto A’s `goal_id` while RLS still stamps/allows B’s own `user_id` (see nested-resource gap below). The upsert **does not trust a body `user_id`**.

Parse (`/api/check-in/parse`) loads only the caller’s active goals ([`parse.ts` L51–55](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/check-in/parse.ts#L51-L55)); no foreign UUID input. Out of Risk #3 write-IDOR scope (rate-limit table is Risk #6).

#### Net worth (assets + liabilities)

Same 404 pattern. Example asset update:

```30:38:src/pages/api/assets/[id].ts
  const { data: existing, error: fetchError } = await supabase
    .from("assets")
    .select()
    .eq("id", assetId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Nie znaleziono aktywa" }, 404);
  }
```

Delete/confirm: [`assets/[id]/delete.ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/assets/%5Bid%5D/delete.ts), [`confirm.ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/assets/%5Bid%5D/confirm.ts). Liabilities: [`liabilities/[id].ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/liabilities/%5Bid%5D.ts), [`liabilities/[id]/delete.ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/liabilities/%5Bid%5D/delete.ts#L29-L44). The risk text says “assets”; **liabilities are the other half of net worth** and use the identical IDOR surface.

#### Helper that is ownership-blind (callers must already have gated)

[`src/lib/goals/sync-saved-amount.ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/goals/sync-saved-amount.ts#L6-L35) loads/updates by `goalId` only. Today every caller (check-in, payment edit/delete) has already 404’d on a foreign goal. Under a user-scoped client, RLS still blocks a stray id. Under a hypothetical service-role client, this helper would mutate any goal. Not a current leak; it is the pattern a future handler must not copy without a prior ownership check.

### SSR reads — no leak today

There is no `/users/{id}` or `/goals/{user-id}` route. `[id]` is always a **resource UUID**.

[`getGoalDetailPageData`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/goals/detail-page.ts#L46-L54) / [`getEditGoalPageData`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/goals/edit-page.ts#L38-L46): `.eq("id", goalId).eq("user_id", userId)` → missing → **redirect `/dashboard`** (not 403). Dashboard and archive filter lists by `user.id` ([`dashboard.astro` L58–110](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/dashboard.astro#L58-L110)).

After the goal is proven owned, payment SELECTs use `goal_id` only ([`detail-page.ts` L57–61](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/goals/detail-page.ts#L57-L61); dashboard L70–73). That is defense-in-depth via RLS, not an SSR leak with the goal filter intact.

Cheapest SSR proof: unit-test `getGoalDetailPageData` with the same mock — foreign id → `{ kind: "redirect" }` **and** `eq("user_id", …)` in `calls`. Do not add Playwright for this.

### RLS — complementary hard stop, not HTTP 404

All money tables enable RLS with ownership predicates (not “TO authenticated” alone):

| Table | RLS | Policies | UPDATE WITH CHECK | SQL test |
|---|---|---|---|---|
| `profiles` | yes | SELECT/UPDATE `auth.uid() = id` | yes | `rls-profiles.sql` |
| `savings_goals` | yes | SELECT/INSERT/UPDATE `auth.uid() = user_id`; no DELETE (abandon is UPDATE) | yes | `rls-savings-goals.sql` |
| `goal_payments` | yes | full CRUD on `user_id` (denormalized; **not** a join to the goal) | yes | `rls-goal-payments.sql` |
| `assets` | yes | full CRUD | yes | `rls-assets.sql` |
| `liabilities` | yes | full CRUD | yes | `rls-liabilities.sql` |
| `ai_checkin_requests` | yes | INSERT/SELECT only | n/a | **none** |

Quotes:

```19:26:supabase/migrations/20260623120000_create_savings_goals.sql
create policy savings_goals_select_own on public.savings_goals
  for select using (auth.uid() = user_id);
-- insert with check; update using + with check
```

```18:28:supabase/migrations/20260623140000_create_goal_payments.sql
create policy goal_payments_select_own on public.goal_payments
  for select using (auth.uid() = user_id);
-- insert / update / delete same predicate
```

```29:51:supabase/migrations/20260623170000_create_assets_and_liabilities.sql
create policy assets_select_own on public.assets
  for select using (auth.uid() = user_id);
-- … liabilities_* equivalent …
```

**Nested-resource gap (schema, not current app):** `goal_payments.user_id` is not constrained to match `savings_goals.user_id` for `goal_id`. RLS allows Alice to insert a row with **Alice’s** `user_id` and **Bob’s** `goal_id`. The app check-in ownership batch is the control. SQL tests insert-reject Bob’s `user_id`; they do **not** assert “Alice cannot pay Bob’s goal with Alice’s user_id.” Phase 2 check-in foreign-`goal_id` test is the right place for that product claim.

`handle_new_user()` is `SECURITY DEFINER` and only inserts the signer’s profile. Completion trigger is invoker. No views.

### Existing tests vs the anti-pattern

Harness: [`src/test/api-route.ts`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/test/api-route.ts). `createTestUser()` is always Alice (`11111111-…`). `createSupabaseMock` records `calls` but **returns FIFO queued data and ignores filter arguments** (L93–129). It cannot emulate RLS. There is **no** `*.test.ts` assertion of `eq` + `user_id`.

| Endpoint | Test file | Unauth 401 | Logged-in B + A’s id | `user_id` in `mock.calls` |
|---|---|---|---|---|
| `POST /api/goals` | `goals/index.test.ts` | yes | n/a (create) | **no** (insert omits `user_id`) |
| `POST /api/goals/[id]` | `goals/[id].test.ts` | yes | **no** | **no** (404 = queued `null`) |
| `POST …/abandon` | `abandon.test.ts` | yes | **no** | **no** |
| `POST …/payments/[paymentId]` | `[paymentId].test.ts` | yes | **no** | **no** |
| `POST …/payments/…/delete` | `delete.test.ts` | yes | **no** | **no** |
| `POST /api/check-in` | `check-in.test.ts` | yes | **no** | **no** (404 = queued `[]`) |
| `POST /api/check-in/parse` | `parse.test.ts` | yes | n/a | **no** |
| assets (all 4 handlers) | **none** | — | — | — |
| liabilities (all 3) | **none** | — | — | — |

Canonical tautology:

```44:48:src/pages/api/goals/[id].test.ts
  it("returns 404 when the goal is missing", async () => {
    const mock = createSupabaseMock();
    mock.queue({ data: null });
    const response = await POST(editContext(mock));
    expect(response.status).toBe(404);
```

Same class: [`abandon.test.ts` L17–22](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D/abandon.test.ts#L17-L22), [`check-in.test.ts` L92–96](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/check-in.test.ts#L92-L96). Create path asserts insert shape **without** `user_id` ([`goals/index.test.ts` L56–62](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/index.test.ts#L56-L62)).

SQL scripts **do** Alice/Bob SELECT empty + UPDATE 0-row (and for payments/assets/liabilities: DELETE 0-row + INSERT other `user_id` rejected). They run via `psql` against local Supabase (`BEGIN` / two `auth.users` / `ROLLBACK`). [`README.md` L98–102](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/README.md#L98-L102): not in `npm test`. [`.github/workflows/ci.yml`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/.github/workflows/ci.yml): `npm test` = `vitest run` only. `vitest.config.ts` `include: ["src/**/*.test.ts"]`.

### What would prove protection (grounded)

Observable (from the test plan, refined):

1. **Write:** logged-in B POSTs A’s goal / payment / asset / liability id → **404**, and the mutate call (if any) still includes `.eq("user_id", bobId)` — never a successful update/delete/upsert of A’s row.
2. **Check-in:** B POSTs A’s `goal_id` → **404**, no `goal_payments` upsert (or upsert not reached).
3. **Create:** insert/upsert payload `user_id` is the session id, not a client field.
4. **Read (SSR):** B opening `/goals/{A’s goal uuid}` → redirect, no goal payload. Cheapest as a function test of `getGoalDetailPageData`.
5. **DB (optional second gate):** Alice SELECT of Bob’s tables = 0; UPDATE/DELETE 0-row — already encoded in `supabase/tests/*.sql`.

Oracle is PRD isolation + this ownership contract, **not** “whatever the handler currently queues.”

## Response-Guidance Verification

| Cell | Test-plan text | Verdict |
|---|---|---|
| What would prove protection | User B gets empty/404 on user A’s ids — read and write — for goals, payments, assets | **Keep, with a split:** HTTP **404** is app-only; RLS returns **empty / 0 rows**. Include **liabilities**. SSR read is redirect, not 404. |
| Must challenge | Being logged in is enough | **Confirmed.** Middleware + every handler test currently encode exactly this assumption. |
| Context to ground | Auth vs ownership; RLS vs app-layer; whether SQL RLS runs in CI | **Grounded:** both layers exist; they are complementary; SQL RLS does **not** run in CI. |
| Likely cheapest layer | integration (API ownership) and/or SQL RLS in the JS/CI loop | **Correct the “and/or”:** cheapest CI proof is **Vitest API ownership via `mock.calls`**. Putting SQL into `npm test` / Vitest is the wrong vehicle (needs Postgres). A separate Actions job is optional and costlier; not justified as Phase 2 primary by supabase quiescence. |
| Anti-pattern | Testing only 401 when logged out | **Confirmed and already present.** Also: queued-empty 404 without asserting the `user_id` filter. |

Do **not** drop Risk #3. Isolation logic exists; CI does not lock it. That is a defect-class regression risk (someone removes `.eq("user_id")` or an RLS policy), not a speculative “add a safeguard first” row.

## Cheapest useful test layer (Phase 2 recommendation)

**Primary (must):** Vitest handler integration on the existing harness. No MSW, no jsdom, no Playwright.

For each ID-scoped write:

1. `createTestUser({ id: bobId })` — a **different** id from Alice’s resource UUID owner.
2. Params/form use Alice’s goal/payment/asset/liability id.
3. Assert `mock.calls` contains `{ method: "eq", args: ["user_id", bobId] }` on the load (and mutate) chain. **This is the load-bearing assertion** — it fails if the filter is deleted even when the queue still returns `null`.
4. Queue empty/`null` (or `[]` for check-in) and assert **404**. Status alone is not enough; keep it as the product contract.
5. Assert no owner-blind mutate: e.g. no `update`/`delete`/`upsert`, or those calls also carry `user_id`.

Minimum set (cost × signal, one case per surface — not every handler happy path):

- Goals: edit `POST /api/goals/[id]` + abandon (or one of them if a shared helper is extracted; prefer **both** because they are separate files).
- Payments: edit **or** delete (both already double-check goal + payment) **and** `POST /api/check-in` with a foreign `goal_id`.
- Net worth: **one** asset write (`[id]` or delete) **and** **one** liability write — currently untested files.
- Create: pin `user_id: session.id` on `POST /api/goals` insert (cheap; already has a happy-path test).

**Optional cheap extra:** `getGoalDetailPageData` foreign id → redirect + `user_id` eq. Skip full dashboard.astro.

**Do not in Phase 2:**

- Add 401 cases (already exist).
- Rely on “missing goal 404” without `user_id` call asserts.
- Fold `supabase/tests/*.sql` into `npm test` (Docker; contradicts S-10 / js-test-baseline / test-coverage).
- Add a sixth RLS script for `ai_checkin_requests` (Risk #6, not #3 money data).
- E2E OTP login to prove IDOR.

**RLS-in-CI decision:** Phase 2 should **record API ownership as the isolation proof** Phase 4 gates (`npm test` already required). Keep the five SQL scripts as the DB oracle, documented, manual until a later gate explicitly adds `supabase start` + `psql`. Residual: CI will not catch a migration that drops RLS. Accept that for Phase 2 cost × signal; do not pretend Vitest mocks prove policies.

## Architecture Insights

- **Defense in depth:** app `.eq("user_id")` produces 404; RLS produces empty rows. Production with anon+session survives dropping either layer alone; dropping **both** (or service_role + dropped app filter) is the catastrophic case.
- **Mock limitation is load-bearing for test design:** because the proxy ignores filters, you cannot prove isolation by queuing Alice’s row and expecting a 404 — the mock would return it even with the filter present. Call-list assertions are the only cheap oracle.
- **404 vs 403:** the product hides existence of another user’s ids (same 404 as malformed UUID). Tests should expect 404, not 403.
- **`/api` is unaudited by middleware:** a new endpoint that forgets `if (!user)` is a 401 gap; one that loads by id without `user_id` is the IDOR gap. Cookbook §6.3/§6.4 should require **both** on every new money route.

## Historical Context (from prior changes)

- [`context/archive/2026-06-10-supabase-schema-rls-baseline/plan.md`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/context/archive/2026-06-10-supabase-schema-rls-baseline/plan.md) (F-01) — profiles RLS + `rls-profiles.sql` as the isolation pattern.
- [`context/archive/2026-06-23-savings-goals-lifecycle/plan.md`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/context/archive/2026-06-23-savings-goals-lifecycle/plan.md) (S-02) — app `id AND user_id`; “User B cannot update/abandon user A’s goal.”
- [`context/archive/2026-06-23-manual-checkin-payments-projections/plan.md`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/context/archive/2026-06-23-manual-checkin-payments-projections/plan.md) (S-03) — denormalized `goal_payments.user_id` for RLS.
- [`context/archive/2026-06-23-net-worth-panel/plan.md`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/context/archive/2026-06-23-net-worth-panel/plan.md) — assets/liabilities `id AND user_id` → 404; `rls-assets.sql` / `rls-liabilities.sql`.
- [`context/archive/2026-09-02-js-test-baseline/plan.md`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/context/archive/2026-09-02-js-test-baseline/plan.md) — Vitest without putting RLS SQL into `npm test`.
- [`context/changes/test-coverage/plan.md`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/context/changes/test-coverage/plan.md) — “SQL RLS scripts … must stay out of `npm test`”; API routes are not middleware-gated.
- [`context/archive/2026-09-03-testing-critical-path-coverage/research.md`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/context/archive/2026-09-03-testing-critical-path-coverage/research.md) — harness cannot test real RLS; Phase 1 did not add cross-user cases.

PRD:

```42:42:context/foundation/prd.md
- Privacy — user A nigdy nie widzi danych user B. Izolacja danych per użytkownik jest bezwzględna.
```

```161:161:context/foundation/prd.md
- Dane użytkownika nie są nigdy dostępne dla innych użytkowników ani bez uwierzytelnienia. Ścisła izolacja danych per użytkownik.
```

`context/foundation/lessons.md` does not exist.

## Related Research

- `context/archive/2026-09-03-testing-critical-path-coverage/research.md` — Phase 1 (Risks #1/#2); same harness limits.
- `context/changes/test-coverage/plan.md` — prior invariant tests; RLS explicitly out of `npm test`.

## Open Questions

1. **Phase 4 vs a later `--refresh`:** should a dedicated CI job (`supabase start` + five `psql -f` scripts) be scheduled now as a follow-up, or only if a migration ever touches RLS again? **Recommendation:** defer; document in cookbook §6.3 that RLS scripts remain the DB oracle and are manual.
2. **Shared test helper:** a small `expectOwnershipEq(mock, userId)` in `src/test/api-route.ts` vs repeating `calls.find` in each file. **Recommendation:** a helper if more than two files grow the same assert; otherwise colocated expects are fine.
3. **`goal_payments.user_id` vs `goal_id` owner:** out of Phase 2 test scope to add a DB CHECK/FK; the check-in foreign-id test covers the product hole. Flag for a future schema slice if desired.

## Code References

- [`src/middleware.ts:4-48`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/middleware.ts#L4-L48) — page auth only; `/api/*` ungated
- [`src/lib/supabase.ts:44-58`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/supabase.ts#L44-L58) — anon SSR client (RLS applies)
- [`src/pages/api/goals/[id].ts:36-44`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D.ts#L36-L44) — goal ownership → 404
- [`src/pages/api/check-in.ts:68-90`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/check-in.ts#L68-L90) — foreign `goal_id` batch check + session `user_id` on upsert
- [`src/pages/api/goals/[id]/payments/[paymentId].ts:32-56`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D/payments/%5BpaymentId%5D.ts#L32-L56) — nested goal+payment `user_id`
- [`src/pages/api/assets/[id].ts:30-38`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/assets/%5Bid%5D.ts#L30-L38) — asset ownership → 404 (no tests)
- [`src/pages/api/liabilities/[id]/delete.ts:29-44`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/liabilities/%5Bid%5D/delete.ts#L29-L44) — liability ownership → 404 (no tests)
- [`src/lib/goals/detail-page.ts:46-54`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/goals/detail-page.ts#L46-L54) — SSR foreign goal → redirect
- [`src/lib/goals/sync-saved-amount.ts:10-35`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/lib/goals/sync-saved-amount.ts#L10-L35) — id-only helper after caller gate
- [`src/test/api-route.ts:26-37`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/test/api-route.ts#L26-L37) — single Alice test user
- [`src/test/api-route.ts:89-155`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/test/api-route.ts#L89-L155) — queue mock; no RLS
- [`src/pages/api/goals/[id].test.ts:34-48`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/src/pages/api/goals/%5Bid%5D.test.ts#L34-L48) — 401 + tautological 404
- [`supabase/migrations/20260623120000_create_savings_goals.sql:17-26`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/supabase/migrations/20260623120000_create_savings_goals.sql#L17-L26) — goals RLS
- [`supabase/tests/rls-savings-goals.sql:21-50`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/supabase/tests/rls-savings-goals.sql#L21-L50) — Alice/Bob SELECT+UPDATE (manual)
- [`.github/workflows/ci.yml:19-21`](https://github.com/kapaminska/saved/blob/b515f8331b1ad66ec30ae23c97ebd39824820428/.github/workflows/ci.yml#L19-L21) — `npm test` only
