# Product README — Plan Brief

> Full plan: `context/changes/product-readme/plan.md`

## What & Why

Kryterium 10xDevs wymaga README opisującego **ten** projekt. Dziś root README to szablon startera (zły clone URL, email+password, brak migracji).

## Starting Point

`README.md` ma użyteczne fragmenty (Node 22, `.dev.vars`, Cloudflare, CI secrets) i dużo nieaktualnego auth/setup.

## Desired End State

Polski README Saved!: wizja, pełny local setup, OTP/Inbucket, opcjonalny `wrangler login`, skrypty, deploy.

## Key Decisions Made

| Decision | Choice | Why |
| -------- | ------ | --- |
| Język | Polski | Wybór użytkownika; spójne z UI |
| Głębokość | Produkt + pełny local setup | Recenzent ma odpalić appkę |
| Architektura src/ | Poza zakresem | Jest w CLAUDE.md |

## Scope

**In scope:** `README.md`

**Out of scope:** CLAUDE.md, `template.png`, kod aplikacji, krok `npm test` w CI (S-10)

## Architecture / Approach

Jedna podmiana pliku. Zachować prawdziwe sekrety/deploy; wyrzucić starter i stary model auth.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Rewrite README.md | Polski produktowy README | Rozjazd z rzeczywistością (init vs start, hasło vs OTP) |

**Prerequisites:** —  
**Estimated effort:** ~1 sesja

## Open Risks & Assumptions

- Skrypt `test` może nie istnieć, dopóki S-10 nie wyląduje — README nie może go obiecywać za wcześnie

## Success Criteria (Summary)

- README mówi Saved!, nie 10x Astro Starter
- Da się z niego odpalić lokalny Supabase + OTP
