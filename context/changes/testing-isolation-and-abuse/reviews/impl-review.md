<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Isolation and abuse — ownership tests for goals, payments, and net worth

- **Plan**: context/changes/testing-isolation-and-abuse/plan.md
- **Scope**: Phase 4 of 4 (full plan)
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned auth/product files bundled into Phase 2

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/supabase.ts, src/middleware.ts, src/pages/api/auth/send-otp.ts, src/pages/api/auth/verify-otp.ts, src/components/auth/ServerError.tsx, src/lib/supabase-auth-error.test.ts
- **Detail**: Plan said “No product-code changes.” Commit `b8be92e` (p2) included six unrelated files (local-URL guard, `formatAuthError`, `supabaseUnavailableMessage`, OTP copy, ServerError typeof guard) after a “stage all” choice. Ownership tests themselves MATCH the plan; this is extra surface in the same history, and F2/F3 live in that extra code.
- **Fix A ⭐ Recommended**: Leave the extra files in history; add a one-line plan addendum that p2 also shipped auth error-formatting / local-URL guard, so later archive/status readers do not treat them as IDOR work.
  - Strength: Matches the user’s explicit “stage all”; avoids rewriting published commits.
  - Tradeoff: This change’s git range still mixes two concerns.
  - Confidence: HIGH — the files are already on `main` and serve a real misconfig UX.
  - Blind spot: None significant for the ownership tests.
- **Fix B**: Move the auth/product files onto a separate change/commit and keep this change test-only.
  - Strength: Restores the plan’s “test-only” boundary.
  - Tradeoff: History rewrite or a revert+recommit; easy to get wrong if anything already depends on the helpers.
  - Confidence: MEDIUM — depends on whether you want this branch history rewritten.
  - Blind spot: Other local work may already import `formatAuthError`.
- **Decision**: FIXED via Fix A

### F2 — Local-URL guard is not sticky after middleware sets null

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:96
- **Detail**: `getSupabase` is `locals.supabase ?? createClient(...)`. Middleware sets `locals.supabase = null` when production hostname meets a loopback `SUPABASE_URL`, but `null ?? x` recreates the client. The recreate path only applies the hostname guard if `requestUrl` is passed. OTP routes pass `context.url`; money APIs and `getGoalDetailPageData` do not. Money handlers still 401 without a user, so this is not an IDOR hole in the planned tests — the new guard simply does not hold on most routes. Extra product code, not a plan-adherence miss.
- **Fix A ⭐ Recommended**: Treat an already-assigned `locals.supabase` (including `null`) as final: `return locals.supabase === undefined ? createClient(...) : locals.supabase`.
  - Strength: Middleware’s null stays null; tests that inject a mock still work (`createApiContext` sets `supabase`).
  - Tradeoff: Callers that never run middleware and leave `supabase` unset still fall through to `createClient`.
  - Confidence: HIGH — `App.Locals.supabase` is always set by middleware; tests set it explicitly.
  - Blind spot: Have not audited every `getSupabase` caller for a path that omits both middleware and `locals.supabase`.
- **Fix B**: Thread `requestUrl` into every `createClient` / `getSupabase` / `resolveSupabase` fallback.
  - Strength: Guard applies even if `locals.supabase` is missing.
  - Tradeoff: Touches SSR loaders and every API handler; larger than the `??` bug.
  - Confidence: MEDIUM — Host header spoofing can still look like localhost.
  - Blind spot: Tunnel/LAN hostnames (`*.trycloudflare.com`, `192.168.x`) are still false positives for “local URL + non-loopback request.”
- **Decision**: FIXED via Fix A

### F3 — Public OTP error names Worker secrets

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/supabase.ts:37-41
- **Detail**: `supabaseUnavailableMessage` returns “Produkcja używa lokalnego Supabase. Ustaw sekrety Workera SUPABASE_URL i SUPABASE_KEY na projekt z supabase.com.” on unauthenticated `POST /api/auth/send-otp` and `verify-otp` (verify also puts it in `?error=`). Secret *values* are not leaked; platform, secret *names*, and a production-miswire diagnosis are. Extra product code from the p2 bundle.
- **Fix**: Keep the generic client string “Supabase nie jest skonfigurowany”; log the diagnostic server-side only.
- **Decision**: FIXED
