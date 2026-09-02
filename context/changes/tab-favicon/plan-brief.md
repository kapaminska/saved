# Browser Tab Favicon — Plan Brief

> Full plan: `context/changes/tab-favicon/plan.md`

## What & Why

Karta przeglądarki nadal pokazuje ikonę ze startera Astro (granatowy napis „saved!”). Chcemy zieloną kafelkową ikonę z `logo/Saved Logo - 07 Celebration.dc.html` — wariant success / „z wyprzedzeniem”.

## Starting Point

`Layout.astro` już ma `<link rel="icon" href="/favicon.png">`. Plik w `public/` to leftover starter. Zielony favicon istnieje tylko jako mock HTML (gradient + inline SVG).

## Desired End State

Na każdej stronie z `Layout.astro` w karcie widać zaokrąglony zielony kafel (`#3fb37c` → `#2f9e6a`) z kremowym wykrzyknikiem i zielonym ptaszkiem.

## Key Decisions Made

| Decision | Choice | Why |
| -------- | ------ | --- |
| Źródło | Zielony kafel z HTML (nie amber, nie hybrid) | Wybór użytkownika; mock jest już w repo |
| Zakres | Tylko ikona karty | Bez apple-touch / PWA |
| Format | SVG (jak w HTML) + PNG nadpisany | CSS w HTML nie działa jako favicon; PNG zamyka stary URL `/favicon.png` |
| Sprzątanie | Tylko favicon | `template.png` i README zostają |

## Scope

**In scope:** `public/favicon.svg`, overwrite `public/favicon.png`, dwa linki `rel=icon` w `Layout.astro`

**Out of scope:** iOS home screen, PWA, topbar w aplikacji, README, testy JS, zmiana tytułów stron

## Architecture / Approach

Spłaszczyć CSS-owy kafel + wewnętrzny SVG z mocku do jednego kwadratowego SVG. Layout ładuje SVG jako primary icon. Stary PNG zostaje podmieniony, żeby defaultowy request `/favicon.png` nie wracał startera.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Green tab favicon | Asset + Layout | Wyeksportować sam mark bez tła = zły wygląd w karcie; cache przeglądarki przy QA |

**Prerequisites:** plik `logo/Saved Logo - 07 Celebration.dc.html` w repo
**Estimated effort:** ~1 sesja, 1 faza

## Open Risks & Assumptions

- Agresywny cache favicon — QA w oknie prywatnym / hard-refresh
- Inner SVG bez tła nie oddaje mocku — plan wymaga spłaszczenia kafla

## Success Criteria (Summary)

- Tab = zielony kafel z mocku, nie granatowy starter i nie amber
- Landing, dashboard i sign-in dzielą tę samą ikonę
