# Isolation and abuse — ownership tests for goals, payments, and net worth

## Overview

Add Vitest integration tests that prove Risk #3 from `context/foundation/test-plan.md`: an authenticated User B cannot read or mutate User A’s goals, payments, assets, or liabilities. Isolation already exists in handlers (session `user.id` + `.eq("user_id", …)`); CI does not lock it. No product-code changes. SQL RLS scripts stay out of `npm test`.

## Current State Analysis

The money path authenticates via `locals.user` and scopes every ID-loaded query by **session `user.id`**. Foreign UUIDs return **HTTP 404**; SSR loaders redirect to `/dashboard`. Middleware gates pages only — `/api/*` is not in `PROTECTED_ROUTES`. RLS on all six user-data tables is the DB backstop (`auth.uid() = user_id`) and is **not** in CI.

Vitest today only proves **401 when logged out**. “Missing resource → 404” cases queue empty data and never inspect `mock.calls` for `.eq("user_id", …)`. `createSupabaseMock` records calls but **ignores filter arguments** and returns FIFO queued data — it cannot emulate RLS. Dropping the ownership filter would leave those 404 tests green.

Assets and liabilities handlers have **zero** Vitest files. Five Alice/Bob SQL scripts exist under `supabase/tests/` as a manual `psql` oracle.

Research (`research.md`) grounds the failure path and corrects the test-plan “and/or SQL RLS in CI” cell: the cheapest CI proof is **Vitest API ownership via `mock.calls`**.

### Key Discoveries:

- `src/test/api-route.ts` — `createTestUser()` defaults to Alice (`11111111-…`) but already accepts `id` overrides; the mock queue does not apply `.eq` filters (`research.md` Code References).
- Goal edit `src/pages/api/goals/[id].ts` loads `.eq("id", goalId).eq("user_id", user.id)` then 404s; update repeats the `user_id` predicate. Abandon is a separate file with the same load+404.
- Check-in `src/pages/api/check-in.ts` is the write that takes **client `goal_id`s**. Batch load `.eq("user_id", user.id).in("id", uniqueGoalIds)` then 404 if the set does not match. Nested RLS on `goal_payments` is denormalized `user_id` — it would still allow Alice to attach a payment to Bob’s `goal_id` with Alice’s `user_id` if this batch check is dropped.
- Payment edit loads **goal then payment**, both with `user_id`. Existing `editPayment` helper hardcodes Alice.
- Asset update `src/pages/api/assets/[id].ts` and liability delete `src/pages/api/liabilities/[id]/delete.ts` use the same 404 pattern; no tests.
- `getGoalDetailPageData` (`src/lib/goals/detail-page.ts`) is `.eq("id", goalId).eq("user_id", userId)` → `{ kind: "redirect", url: "/dashboard" }`. No GET money APIs exist.
- Create `POST /api/goals` stamps `user_id: user.id` from the session; the existing insert assert omits `user_id`.
- Oracle: PRD isolation NFR + this ownership contract — **not** “whatever the handler currently queues.”

## Desired End State

`npm test` fails if:

1. Logged-in Bob POSTs Alice’s goal / payment / asset / liability id and the handler does **not** call `.eq("user_id", bobId)` on the load (even when the queue still returns `null` and status is 404).
2. That same request returns anything other than **404**, or proceeds to `update` / `delete` / `upsert` of Alice’s row.
3. Check-in with Alice’s `goal_id` as Bob does not 404, or reaches a `goal_payments` upsert.
4. `POST /api/goals` insert payload `user_id` is missing or is not the session id.
5. `getGoalDetailPageData(bobId, aliceGoalId)` does not redirect to `/dashboard`, or does not call `.eq("user_id", bobId)`.

After implementation, `context/foundation/test-plan.md` §6.3 and §6.4 contain the ownership / new-endpoint cookbook; §2 Risk Response Guidance matches research (HTTP 404 vs RLS empty, liabilities included, Vitest not SQL-in-CI, queued-empty anti-pattern). The isolation proof Phase 4 of the rollout will lock is **Vitest API ownership**.

### Verification

- `npm test` passes locally and in CI (no new secrets, jobs, Docker, or `psql`).
- Each new ownership `it` names Bob vs Alice (or “another user’s id”) and asserts `expectOwnershipEq` plus 404 / redirect — not 401.

## What We're NOT Doing

- Product or schema changes (including a CHECK/FK that `goal_payments.user_id` matches the goal owner).
- Folding `supabase/tests/*.sql` into `npm test` or GitHub Actions.
- Playwright, OTP login e2e, jsdom, MSW, coverage thresholds.
- Adding more 401 cases to **existing** handler tests (they already exist).
- Every ID-scoped write: payment delete, asset delete/confirm, liability edit, asset/liability create.
- `getEditGoalPageData`, `dashboard.astro`, or other SSR list loaders.
- A sixth RLS script for `ai_checkin_requests` (Risk #6).
- Strengthening `sync-saved-amount.ts` (callers already gated; not a current leak).

## Implementation Approach

Reuse `createApiContext` + `createSupabaseMock`. Add a shared `expectOwnershipEq` helper first, then one logged-in-Bob case per IDOR family (cost × signal), then the cheap SSR function test, then cookbook.

**Bob is a different `createTestUser({ id })` from Alice’s resource owner.** Params/form use Alice’s UUIDs. Queue `null` (or `[]` for check-in). Assert helper + 404 + no mutate. Do not queue Alice’s row — the mock would return it even with the filter present.

Oracle: PRD isolation + research ownership contract. Challenge: “being logged in is enough.”

## Critical Implementation Details

`createSupabaseMock` **ignores `.eq` arguments**. Queuing Alice’s full row and expecting 404 cannot prove ownership — the handler would receive the row and might 200. Ownership tests **must** queue empty/`null` (check-in: `[]`) **and** assert `.eq("user_id", bobId)` on `mock.calls`. Status 404 alone is the product contract, not the isolation proof.

Use a Bob UUID that does not collide with Alice (`11111111-…`), the usual goal id (`22222222-…`), the payment-edit fixture (`33333333-…`), or check-in’s `otherGoalId` (`44444444-…`). Prefer a named constant on the harness (e.g. `OTHER_USER_ID` = `99999999-9999-4999-8999-999999999999`).

Product hides existence of another user’s ids: expect **404**, not 403. SSR expects **redirect `/dashboard`**, not 404.

Existing payment `editPayment` hardcodes Alice; Bob cases need their own context (or an optional `user` argument). Asset update fetches **before** form parse — an IDOR case does not need a valid body.

---

## Phase 1: Harness + goal ownership

### Overview

Ship the shared assertion helper, then prove logged-in Bob cannot edit or abandon Alice’s goal, and that create stamps the session id. Establishes the pattern every later phase copies.

### Changes Required:

#### 1. Ownership assertion helper

**File**: `src/test/api-route.ts`

**Intent**: One helper so 6+ files assert the same load-bearing call without copying a fragile `calls.find`. Optional second-user id constant so Bob does not collide with existing fixtures.

**Contract**: Export `expectOwnershipEq(calls, userId, options?: { table?: string })` that fails unless some recorded call has `method: "eq"` and `args: ["user_id", userId]` (and `table` when given). Export a Bob id constant distinct from Alice and from `22222222` / `33333333` / `44444444` fixtures.

```ts
export function expectOwnershipEq(
  calls: SupabaseMockCall[],
  userId: string,
  options?: { table?: string },
): void
```

**Behavior asserted**: Tests can prove the session `user_id` filter was issued.

**Regression caught**: Helper-less copy-paste that checks the wrong `args` shape.

**Research source**: `research.md` Cheapest useful test layer (steps 1–3); Open Question 2 (helper when >2 files).

**Edge/error/boundary**: Zero matching calls must fail (not a soft `undefined` expect).

**Anti-pattern avoided**: Implementation mirror of handler internals beyond the `eq("user_id", sessionId)` contract.

#### 2. Goal edit — logged-in Bob + Alice’s id

**File**: `src/pages/api/goals/[id].test.ts`

**Intent**: Prove edit is ownership-gated, not merely authenticated.

**Contract**: `createTestUser({ id: OTHER_USER_ID })`, `params.id` = Alice’s goal UUID, queue `{ data: null }`. Assert 404, `expectOwnershipEq(mock.calls, bobId, { table: "savings_goals" })`, and no `update` in `mock.calls`. Add a **new** `it`, do not replace the existing 401 or queued-missing 404.

**Behavior asserted**: Logged-in Bob gets HTTP 404 on Alice’s goal id; load used Bob’s `user_id`.

**Regression caught**: Deleting `.eq("user_id", user.id)` while tests still queue `null`.

**Research source**: `research.md` Goals (`goals/[id].ts` load+404); Existing tests table (401 yes, Bob+Alice id no).

**Edge/error/boundary**: Authenticated but not owner (not logged-out, not malformed UUID).

**Anti-pattern avoided**: 401-when-logged-out; queued-empty 404 without `user_id` call assertion.

#### 3. Goal abandon — logged-in Bob + Alice’s id

**File**: `src/pages/api/goals/[id]/abandon.test.ts`

**Intent**: Same ownership proof on the separate abandon handler (not assumed to share edit’s load).

**Contract**: Same Bob + Alice goal id + queue `null` + 404 + `expectOwnershipEq` on `savings_goals` + no `update`.

**Behavior asserted**: Bob cannot abandon Alice’s goal.

**Regression caught**: Abandon file drops `user_id` while edit still has it.

**Research source**: `research.md` minimum set — prefer **both** edit and abandon because they are separate files.

**Edge/error/boundary**: Write path that is not edit (status flip).

**Anti-pattern avoided**: “One goal handler is enough”; 401-only.

#### 4. Create stamps session `user_id`

**File**: `src/pages/api/goals/index.test.ts`

**Intent**: Insert owner comes from the session, not a client field.

**Contract**: On the existing successful-insert test (or a sibling `it` if cleaner), assert `insert.args[0].user_id === user.id`. Form must not include `user_id`.

**Behavior asserted**: Create payload `user_id` is the session id.

**Regression caught**: Insert omits `user_id` or starts trusting a body owner field.

**Research source**: `research.md` What would prove protection #3; `goals/index.test.ts` insert omit.

**Edge/error/boundary**: Happy-path create — the gap is the missing field assert, not a new error path.

**Anti-pattern avoided**: Treating “200 + name in response” as proof of owner stamping.

### Success Criteria:

#### Automated Verification:

- `expectOwnershipEq` fails when `calls` has no `eq("user_id", userId)`
- Goal edit and abandon each have a Bob-vs-Alice 404 case with helper + no `update`
- `POST /api/goals` insert assert includes `user_id: session.id`
- `npm test` passes

#### Manual Verification:

- None required

---

## Phase 2: Nested payments + check-in foreign `goal_id`

### Overview

Prove Bob cannot mutate Alice’s payment, and cannot check-in onto Alice’s `goal_id` (the nested-resource hole RLS does not close).

### Changes Required:

#### 1. Payment edit — logged-in Bob + Alice’s ids

**File**: `src/pages/api/goals/[id]/payments/[paymentId].test.ts`

**Intent**: Nested write is gated on **both** goal and payment `user_id`, using Bob’s session — not Alice’s fixture user baked into `editPayment`.

**Contract**: Bob in `locals.user`; `params` = Alice’s `goalId` + `paymentId`; queue `{ data: null }` for the **goal** load (404 before payment fetch). Assert 404, `expectOwnershipEq` on `savings_goals` with `bobId`, no `update` / `upsert`. Do not use the Alice-hardcoded `editPayment` as-is.

**Behavior asserted**: Logged-in Bob gets 404 on Alice’s payment URL; goal load used Bob’s `user_id`.

**Regression caught**: Payment edit loads goal by id only; Bob mutates Alice’s payment after a successful goal fetch from the filter-blind mock.

**Research source**: `research.md` Payments nested resource; minimum set “edit **or** delete” — this plan picks **edit** (existing mutate test file; delete is the same double-check).

**Edge/error/boundary**: Nested URL (goal id + payment id) while authenticated as someone else.

**Anti-pattern avoided**: 401-only; asserting payment-row 404 without a `user_id` eq on the goal load.

#### 2. Check-in — Bob posts Alice’s `goal_id`

**File**: `src/pages/api/check-in.test.ts`

**Intent**: Client-supplied `goal_id` cannot book a payment on another user’s goal. This is the product control for the schema gap (`goal_payments.user_id` is not forced to match the goal owner).

**Contract**: Valid past month (`2020-01`) + Alice’s goal UUID + amount, `locals.user` = Bob. Queue `{ data: [] }`. Assert 404, `expectOwnershipEq` on `savings_goals` with `bobId`, and **no** `goal_payments` `upsert` (and no `upsert` at all). Distinct from the existing “active goal is missing” case (that one uses Alice).

**Behavior asserted**: Bob’s check-in with Alice’s `goal_id` is 404; batch load filtered by Bob; no payment upsert.

**Regression caught**: Dropping `.eq("user_id", user.id)` on the batch so `.in("id", …)` + queued `[]` still 404s without an ownership call; or skipping the batch check and upserting onto Alice’s `goal_id` with Bob’s `user_id`.

**Research source**: `research.md` Check-in client `goal_id`s; Nested-resource gap; What would prove protection #2.

**Edge/error/boundary**: Authenticated write with a well-formed UUID that belongs to someone else (not invalid UUID 400).

**Anti-pattern avoided**: Queued-empty 404 without `user_id` assertion; treating uniqueness/upsert tests as ownership.

### Success Criteria:

#### Automated Verification:

- Payment edit has a Bob-vs-Alice 404 case with `expectOwnershipEq` and no mutate
- Check-in has a Bob + Alice `goal_id` 404 case with `expectOwnershipEq` and no `goal_payments` upsert
- `npm test` passes

#### Manual Verification:

- None required

---

## Phase 3: Net worth writes + SSR read

### Overview

Cover the other half of Risk #3 (assets and liabilities — currently untested) and the cheapest SSR read proof.

### Changes Required:

#### 1. Asset write — logged-in Bob + Alice’s id

**File**: `src/pages/api/assets/[id].test.ts` (new)

**Intent**: First Vitest file for assets; prove update 404s for another user’s asset id. A single 401 `it` is allowed here only because the file is new (cookbook §6.4 dual gate) — it is **not** the isolation proof.

**Contract**: Colocate next to the handler. Bob + Alice’s asset UUID + queue `{ data: null }`. Assert 404, `expectOwnershipEq` on `assets` with `bobId`, no `update`. Fetch runs before form parse — body may be empty. Optional one 401 without `user`. Do not add happy-path CRUD.

**Behavior asserted**: Logged-in Bob gets 404 on Alice’s asset id; load used Bob’s `user_id`.

**Regression caught**: Asset update loads by id only; net worth leaks while goals tests stay green.

**Research source**: `research.md` Net worth; minimum set “**one** asset write”; assets have no test files.

**Edge/error/boundary**: Authenticated cross-user write on a previously untested resource type.

**Anti-pattern avoided**: 401-only as the whole file; happy-path asset CRUD; queued-empty 404 without `user_id` eq.

#### 2. Liability write — logged-in Bob + Alice’s id

**File**: `src/pages/api/liabilities/[id]/delete.test.ts` (new)

**Intent**: Liabilities are the other half of net worth (risk text said “assets”; research includes both). Prove delete 404s for another user’s liability id.

**Contract**: Same Bob + foreign UUID + queue `null` + 404 + `expectOwnershipEq` on `liabilities` + no `delete` (mutate method). Optional one 401. No happy-path delete.

**Behavior asserted**: Logged-in Bob gets 404 on Alice’s liability id; load used Bob’s `user_id`.

**Regression caught**: Liability delete by id only.

**Research source**: `research.md` liabilities `[id]/delete.ts`; minimum set “**one** liability write.”

**Edge/error/boundary**: Destructive write, authenticated, wrong owner.

**Anti-pattern avoided**: Assuming assets tests cover net worth; 401-only.

#### 3. SSR goal detail — Bob opens Alice’s goal id

**File**: `src/lib/goals/detail-page.test.ts` (new)

**Intent**: Read proof without Playwright: foreign id redirects; filter used Bob’s id.

**Contract**: Call `getGoalDetailPageData(mock.client, new Headers(), dummyCookies, bobId, aliceGoalId)`. Queue `{ data: null }`. Assert `{ kind: "redirect", url: "/dashboard" }` and `expectOwnershipEq` on `savings_goals` with `bobId`. Passing `mock.client` as `supabaseFromLocals` must skip `createClient`. Do not render `.astro`.

**Behavior asserted**: Bob does not receive Alice’s goal payload; redirect + `user_id` eq.

**Regression caught**: Detail loader drops `.eq("user_id", userId)` while API tests still pass.

**Research source**: `research.md` SSR reads; cheapest SSR proof; skip `dashboard.astro`.

**Edge/error/boundary**: Authenticated read of another user’s resource UUID (same 404-as-hide-existence policy, expressed as redirect).

**Anti-pattern avoided**: E2E OTP login to prove IDOR; asserting redirect without `user_id` eq (queued `null` would still redirect).

### Success Criteria:

#### Automated Verification:

- `src/pages/api/assets/[id].test.ts` exists with Bob-vs-Alice 404 + `expectOwnershipEq` and no `update`
- `src/pages/api/liabilities/[id]/delete.test.ts` exists with Bob-vs-Alice 404 + `expectOwnershipEq` and no `delete`
- `src/lib/goals/detail-page.test.ts` exists with redirect `/dashboard` + `expectOwnershipEq`
- `npm test` passes

#### Manual Verification:

- None required

---

## Phase 4: Cookbook backport

### Overview

Record how to add ownership tests and how a new money endpoint must prove both auth and ownership. Align §2 response guidance with research. Mark rollout Phase 2 complete. No file:line anchors in §1–§2.

### Changes Required:

#### 1. §6.3 Adding an ownership / isolation test

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the Phase 2 TBD with the logged-in-but-not-owner pattern this change ships.

**Contract**: Location: colocated handler `*.test.ts` (SSR: colocated next to the loader). Harness: `createTestUser({ id: OTHER_USER_ID })` + `createSupabaseMock` + `expectOwnershipEq`. Queue empty/`null` (`[]` for list/batch). Assert HTTP 404 (SSR: `{ kind: "redirect", url: "/dashboard" }`) **and** `.eq("user_id", bobId)` **and** no owner-blind mutate. Challenge: being logged in is enough. State that `createSupabaseMock` ignores filters. SQL scripts remain the DB oracle and stay out of `npm test`. Isolation proof for Phase 4 gates = this Vitest pattern.

#### 2. §6.4 Adding a test for a new API endpoint

**File**: `context/foundation/test-plan.md`

**Intent**: New money routes need **both** gates: 401 without a user, and logged-in Bob + foreign UUID → 404 + `expectOwnershipEq`. 401 alone is not isolation.

**Contract**: Replace TBD. Point at Phase 3 asset/liability files as the first-file example. Create paths must pin insert `user_id` to the session. Do not add MSW/Playwright because it feels safer.

#### 3. §6.6 Per-rollout-phase notes

**File**: `context/foundation/test-plan.md`

**Intent**: Record what Phase 2 landed.

**Contract**: One bullet: `testing-isolation-and-abuse` — Risk #3 handler cases (goal edit/abandon, payment edit, check-in foreign `goal_id`, asset update, liability delete, goals create `user_id`, `getGoalDetailPageData` redirect) plus `expectOwnershipEq`. SQL RLS not wired.

#### 4. §2 Risk Response Guidance alignment

**File**: `context/foundation/test-plan.md`

**Intent**: Backport research corrections into the Risk #3 response row only — no file anchors (principle #3).

**Contract**: Proof: HTTP **404** (SSR: redirect) on A’s ids — read and write — for goals, payments, assets, **and liabilities**; app empty-row → 404; RLS empty is the DB backstop. Challenge: unchanged. Context: auth vs ownership; app session `user_id` filter is the HTTP proof; SQL RLS is not in CI; mock ignores filters so tests must assert `mock.calls` `eq("user_id", bobId)`. Cheapest layer: **integration (Vitest API ownership)** — drop “and/or SQL RLS in the JS/CI loop” as primary. Anti-pattern: 401-when-logged-out **or** queued-empty 404 without a `user_id` call assertion.

Do not add `src/…` paths to §2.

#### 5. §3 rollout status

**File**: `context/foundation/test-plan.md`

**Intent**: Mark rollout Phase 2 complete after Progress for this change is `[x]`.

**Contract**: §3 row 2 Status → `complete`. Do not rewrite Test types / Goal cells (frozen until `--refresh`).

### Success Criteria:

#### Automated Verification:

- `npm test` still passes

#### Manual Verification:

- §6.3, §6.4, and the new §6.6 bullet match the tests that shipped
- §2 Risk #3 response row has no file:line anchors and names 404 vs empty, liabilities, Vitest-not-SQL, and the queued-empty anti-pattern

---

## Testing Strategy

### Unit Tests:

- None beyond `getGoalDetailPageData` (a function test of the SSR loader, not a component render). No unit test of `expectOwnershipEq` itself — the first handler case is the proof.

### Integration Tests:

- Logged-in Bob + Alice’s resource UUID on: goal edit, goal abandon, payment edit, check-in, asset update, liability delete.
- Create: session `user_id` on `POST /api/goals` insert.
- Optional 401 only on **new** net-worth files (dual gate), never as a substitute for Bob cases.

### Manual Testing Steps:

1. Read §6.3 / §6.4 after Phase 4 and confirm an agent could add a new money route test from the cookbook alone.
2. Do not run `psql` RLS scripts as part of this change.

## Performance Considerations

None. Tests are in-process Vitest against the existing queue mock.

## Migration Notes

None. Test-only change.

## References

- Related research: `context/changes/testing-isolation-and-abuse/research.md`
- Test plan: `context/foundation/test-plan.md` — Risk #3, §3 Phase 2, §6.3/§6.4 TBD
- Similar implementation: `context/archive/2026-09-03-testing-critical-path-coverage/plan.md`
- Harness: `src/test/api-route.ts`
- Prior invariant: `context/changes/test-coverage/plan.md` — SQL RLS stays out of `npm test`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness + goal ownership

#### Automated

- [x] 1.1 expectOwnershipEq helper fails when calls have no eq user_id — bc2c5a2
- [x] 1.2 Goal edit Bob-vs-Alice 404 with expectOwnershipEq and no update — bc2c5a2
- [x] 1.3 Goal abandon Bob-vs-Alice 404 with expectOwnershipEq and no update — bc2c5a2
- [x] 1.4 POST /api/goals insert assert includes user_id: session.id — bc2c5a2
- [x] 1.5 npm test passes after goal ownership cases — bc2c5a2

### Phase 2: Nested payments + check-in foreign goal_id

#### Automated

- [x] 2.1 Payment edit Bob-vs-Alice 404 with expectOwnershipEq and no mutate — b8be92e
- [x] 2.2 Check-in Bob + Alice goal_id 404 with expectOwnershipEq and no upsert — b8be92e
- [x] 2.3 npm test passes after payment and check-in ownership cases — b8be92e

### Phase 3: Net worth writes + SSR read

#### Automated

- [x] 3.1 Asset update Bob-vs-Alice 404 with expectOwnershipEq and no update — 79f8dae
- [x] 3.2 Liability delete Bob-vs-Alice 404 with expectOwnershipEq and no delete — 79f8dae
- [x] 3.3 getGoalDetailPageData foreign id redirects to /dashboard with expectOwnershipEq — 79f8dae
- [x] 3.4 npm test passes after net worth and SSR cases — 79f8dae

### Phase 4: Cookbook backport

#### Automated

- [x] 4.1 npm test still passes after cookbook edits — e2d8d4d

#### Manual

- [x] 4.2 §6.3 / §6.4 / §6.6 match the tests that shipped — e2d8d4d
- [x] 4.3 §2 Risk #3 response row aligned (no file anchors) — e2d8d4d
- [x] 4.4 §3 Phase 2 Status set to complete — e2d8d4d
