# JS Test Baseline — Plan Brief

> Full plan: `context/changes/js-test-baseline/plan.md`

## What & Why

10xDevs wymaga obecności testów. Nie ma runnera JS; RLS SQL nie zamyka tego checkboxa. S-03 odłożyło testy projekcji „na później”.

## Starting Point

Czyste funkcje w `src/lib/goals/projection.ts`. CI: lint + build. Zero `*.test.ts`.

## Desired End State

`npm test` (Vitest run) + testy tempa/daty/statusu celu + ten sam skrypt w GitHub Actions.

## Key Decisions Made

| Decision | Choice | Why |
| -------- | ------ | --- |
| Cel testów | Projekcje celów | Unikalna logika, zero I/O |
| Runner / CI | Vitest + `npm test` w jobie `ci` | Checkbox certyfikacji; CI musi pokazać testy |
| E2E | Nie | Za duży scope vs jeden znaczący test |

## Scope

**In scope:** `vitest.config.ts`, `projection.test.ts`, `package.json` script, CI step

**Out of scope:** Playwright, API tests, AI parse, coverage, RLS w npm

## Architecture / Approach

Vitest z aliasem `@` jak tsconfig. Testy importują `vitest` wprost. CI: `npm test` po lint, przed build.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Vitest + projection + CI | Runner, testy, CI | Flaki od `new Date()` — plan wymaga pinowanego `asOfDate` |

**Prerequisites:** logika S-03 już w repo  
**Estimated effort:** ~1 sesja

## Open Risks & Assumptions

- Typed ESLint na plikach testowych może wymagać drobnego ignore — tylko jeśli `npm run lint` padnie
- README (S-09) może powstać wcześniej bez linii `npm test` — S-10 nie blokuje się na README

## Success Criteria (Summary)

- `npm test` zielone lokalnie i w CI
- Test ćwiczy projekcje, nie `1+1`
