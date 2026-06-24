---
project: "Saved!"
version: 1
status: active
created: 2026-06-10
updated: 2026-06-24
prd_version: 1
main_goal: quality
top_blocker: time
---

# Roadmap: Saved!

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Brak prostego sposobu na śledzenie wielu celów oszczędnościowych jednocześnie z poczuciem postępu i realistyczną prognozą. Ludzie porzucają śledzenie z powodu frikcji, nie z braku chęci oszczędzania. Saved! zamienia jedno zdanie w naturalnym języku raz w miesiącu na strukturalne wpłaty przypisane do celów, aktualizuje postęp i pokazuje prognozę — minimalna frikcja przy maksymalnej informacji zwrotnej. Specyfika produktu — cecha, bez której aplikacja jest nieodróżnialna od zwykłego arkusza — to parsowanie NL: jedno zdanie zamienia się w strukturę, a nie użytkownik ręcznie wypełnia formularz. Panel wartości netto pełni rolę motywacyjnego kontekstu, nie jest rdzeniem.

## North star

**S-04: Użytkownik robi AI check-in end-to-end** — wpisuje zdanie, AI parsuje wpłaty, review, zapis, dashboard pokazuje zaktualizowany postęp z projekcją i statusem. Realizuje Primary Success Criterion i stanowi moment „wow" dla portfolio.

> Gwiazda przewodnia to najmniejszy end-to-end przebieg, który udowadnia, że produkt działa — umieszczony najwcześniej jak pozwalają zależności, bo wszystko inne ma sens tylko jeśli ten przebieg się sprawdzi.

## At a glance

| ID   | Change ID                           | Outcome (user can …)                                                          | Prerequisites | PRD refs                                    | Status      |
| ---- | ----------------------------------- | ----------------------------------------------------------------------------- | ------------- | ------------------------------------------- | ----------- |
| F-01 | supabase-schema-rls-baseline        | (foundation) Migracje Supabase + RLS baseline                                 | —             | NFR (izolacja danych, integralność danych)  | done        |
| S-01 | auth-onboarding-profile             | Zarejestrować się magic linkiem, przejść onboarding, edytować profil          | F-01          | FR-001–FR-004, FR-028–FR-029, FR-031        | done        |
| S-02 | savings-goals-lifecycle             | Tworzyć, edytować, porzucać cele; świętować osiągnięcie; przeglądać archiwum  | F-01          | FR-005–FR-007, FR-009–FR-010, FR-030        | in-progress |
| S-03 | manual-checkin-payments-projections | Zapisywać wpłaty manualnie, przeglądać historię, widzieć projekcję i status   | S-02          | FR-012, FR-015–FR-022                       | done        |
| S-04 | ai-checkin-safety                   | Wysłać zdanie NL, zobaczyć propozycje AI, zatwierdzić wpłaty                  | S-03          | US-01, FR-011, FR-013–FR-014, FR-032–FR-036 | done        |
| S-05 | landing-page-unauthenticated        | Zobaczyć polski landing z CTA logowania; zalogowany trafia na dashboard       | F-01          | Access Control, Business Logic (ciepły ton) | done        |
| S-06 | visual-language-polish              | Korzystać z ciepłego języka wizualnego w całej aplikacji (paleta, typografia) | S-05          | FR-010, NFR (feedback UX), Business Logic   | done        |
| S-07 | net-worth-panel                     | Śledzić aktywa/pasywa i widzieć wartość netto obok celów                      | F-01          | FR-023–FR-027                               | done        |

## Streams

Nawigacja — grupuje elementy współdzielące łańcuch zależności. Kanoniczne sekwencjonowanie to graf zależności poniżej; ta tabela pokazuje proponowaną kolejność czytania równoległych ścieżek.

| Stream | Theme                 | Chain                             | Note                                                                 |
| ------ | --------------------- | --------------------------------- | -------------------------------------------------------------------- |
| A      | Pętla oszczędzania    | `F-01` → `S-02` → `S-03` → `S-04` | Ścieżka krytyczna do gwiazdy przewodniej (S-04); quality-first       |
| B      | Tożsamość użytkownika | `S-01`                            | Równolegle ze Streamem A po `F-01`; domyka auth + onboarding na demo |
| C      | Tożsamość produktu    | `S-05` → `S-06`                   | Landing z ciepłą paletą, potem spójny język wizualny w app           |
| D      | Kontekst net worth    | `S-07`                            | Równolegle po `F-01`; Secondary Success Criterion                    |

## Baseline

Stan codebase na 2026-06-10 (auto-researched + potwierdzone). Foundations poniżej zakładają, że te warstwy są obecne i NIE scaffoldują ich ponownie.

- **Frontend:** present — Astro 6.3.1 + React 19 + Tailwind CSS 4 + Radix UI primitives (`src/components/`)
- **Backend / API:** present — Astro API routes (`src/pages/api/auth/`), middleware (`src/middleware.ts`)
- **Data:** present — Supabase migracje + RLS (`supabase/migrations/`, wzorzec od `profiles` przez `savings_goals`, `goal_payments`, `assets`)
- **Auth:** present — Supabase SSR auth, `getUser()` w middleware, endpointy signin/signup/signout, ochrona `/dashboard`
- **Deploy / infra:** present — adapter Cloudflare, `wrangler deploy`, CI/CD (`.github/workflows/ci.yml`)
- **Observability:** absent — brak logowania, error trackingu, metryk

## Foundations

### F-01: Supabase migrations + RLS baseline

- **Outcome:** (foundation) Migracje włączone w konfiguracji Supabase, tabela `profiles` z polityką RLS (user widzi tylko swoje dane), wzorzec RLS udokumentowany dla kolejnych tabel.
- **Change ID:** supabase-schema-rls-baseline
- **PRD refs:** NFR (izolacja danych, integralność danych)
- **Unlocks:** S-01 (potrzebuje tabeli profiles), S-02 (wzorzec migracji dla tabeli goals), S-03 (tabela payments)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Tooling migracyjny nie był jeszcze testowany w tym projekcie (Supabase config ma `schema_paths = []`); jeśli setup lokalny ma problemy, wszystkie downstream slices są zablokowane.
- **Status:** done

## Slices

### S-01: Auth, onboarding & profil

- **Outcome:** Użytkownik może zarejestrować się i zalogować przez magic link (email-only), opcjonalnie podać imię i dane profilowe podczas onboardingu, edytować profil później, wylogować się z dowolnej strony.
- **Change ID:** auth-onboarding-profile
- **PRD refs:** FR-001–FR-004, FR-028–FR-029, FR-031
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Magic link może wymagać konfiguracji email providera w Supabase; obecny scaffold auth może używać email+password — zakres przeróbki niejasny do czasu gdy F-01 zweryfikuje setup.
- **Status:** done

### S-02: Cykl życia celów oszczędnościowych

- **Outcome:** Użytkownik może stworzyć cel oszczędnościowy (nazwa, kwota docelowa, opcjonalny deadline), edytować go, porzucić (status → abandoned), zobaczyć automatyczne ukończenie przy 100% z momentem celebracji (wiadomość + confetti), oraz przeglądać ukończone i porzucone cele w archiwum.
- **Change ID:** savings-goals-lifecycle
- **PRD refs:** FR-005–FR-007, FR-009–FR-010, FR-030
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Hard limit długości nazwy celu — limit formularza/schemy. Owner: downstream. Block: no.
- **Risk:** Moment celebracji (confetti) to brand moment produktu („Saved!") i kluczowy element portfolio — wymaga visual polish. Logika auto-complete musi obsłużyć edge case nadpłaty.
- **Status:** in-progress

### S-03: Manualny check-in, historia wpłat & projekcje

- **Outcome:** Użytkownik może zapisywać wpłaty manualnie (w tym zerowe miesiące i backdating), przeglądać/edytować/usuwać historię wpłat per cel, oraz widzieć wyliczone wymagane tempo, prognozowaną datę ukończenia i klasyfikację statusu (on track / behind / ahead) dla każdego celu.
- **Change ID:** manual-checkin-payments-projections
- **PRD refs:** FR-012, FR-015–FR-022
- **Prerequisites:** S-02
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Konkretne progi klasyfikacji statusu (on track / behind / ahead) — jak dokładnie definiujemy próg? Procentowe odchylenie od wymaganego tempa? Owner: user. Block: no (implementacja może użyć rozsądnych defaults).
- **Risk:** Etykieta wiarygodności projekcji („na podstawie N miesięcy danych") jest kluczowa dla UX — bez niej wczesne projekcje (1–2 punkty) mylnie sugerują pewność. Ten slice dostarcza manualny fallback, który musi działać bezbłędnie zanim warstwa AI zostanie dodana.
- **Status:** done

### S-04: AI check-in + safety

- **Outcome:** Użytkownik może wysłać zdanie w języku naturalnym (np. „500 na wakacje, 1000 na poduszkę"), zobaczyć propozycje wpłat sparsowane przez AI, zrecenzować/edytować je i zapisać — z walidacją inputu (limit 500 znaków, odrzucenie pustego), rate limitingiem, walidacją strukturalną odpowiedzi AI i graceful fallback do ścieżki manualnej przy awarii AI.
- **Change ID:** ai-checkin-safety
- **PRD refs:** US-01, FR-011, FR-013–FR-014, FR-032–FR-036
- **Prerequisites:** S-03
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wybór providera AI (nie zdecydowany na poziomie tech-stack) wpływa na latency, koszt i format odpowiedzi — decyzja należy do `/10x-plan`. Guardrail: awaria AI nigdy nie blokuje użytkownika — manualny fallback (dostarczony w S-03) jest siatką bezpieczeństwa.
- **Status:** done

### S-05: Landing dla niezalogowanych

- **Outcome:** Niezalogowany użytkownik widzi polski landing z wartością produktu (cele, check-in, projekcja), sloganem i CTA „Zaloguj się"; zalogowany użytkownik trafia na dashboard (lub onboarding), nigdy nie widzi landingu.
- **Change ID:** landing-page-unauthenticated
- **PRD refs:** Access Control (mini-landing), Business Logic (ciepły ton)
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ciepła paleta na landingu wymaga późniejszego S-06, żeby app nie wyglądała na dwa różne produkty; landing-only scope ogranicza ten dług.
- **Status:** done

### S-06: Język wizualny (PRD + shape-notes)

- **Outcome:** Użytkownik korzysta z aplikacji ze spójnym ciepłym językiem wizualnym: paleta, humanist sans-serif, zaokrąglone karty (12–16px), mikro-interakcje i łagodny ton prezentacji — zgodnie z PRD (motywująca forma, ciepły ton) i `shape-notes.md` §Forward: visual-language.
- **Change ID:** visual-language-polish
- **PRD refs:** FR-010, NFR (feedback UX), Business Logic (ciepły ton)
- **Prerequisites:** S-05
- **Parallel with:** S-07
- **Blockers:** —
- **Unknowns:**
  - Konkretny font i tokeny kolorów — decyzja design w `/10x-plan`. Owner: user. Block: no.
- **Risk:** Zastąpienie cosmic theme w app wymaga dotknięcia wielu widoków; S-05 zostawił warm utilities tylko na landingu — ten slice harmonizuje resztę bez psucia pętli oszczędzania.
- **Status:** done

### S-07: Panel wartości netto

- **Outcome:** Użytkownik może dodać/edytować/usunąć aktywa i pasywa, zobaczyć wartość netto (aktywa minus pasywa), potwierdzić że aktywo jest aktualne bez zmiany kwoty, oraz dostać łagodny prompt gdy dane są nieaktualne (>3 miesiące).
- **Change ID:** net-worth-panel
- **PRD refs:** FR-023–FR-027
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Net worth to kontekst motywacyjny, nie rdzeń — panel nie może dominować dashboardu nad celami oszczędnościowymi (Secondary Success Criterion).
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                           | Suggested issue title                              | Ready for `/10x-plan` | Notes                                        |
| ---------- | ----------------------------------- | -------------------------------------------------- | --------------------- | -------------------------------------------- |
| F-01       | supabase-schema-rls-baseline        | Supabase migrations + RLS baseline                 | —                     | Zarchiwizowane                               |
| S-01       | auth-onboarding-profile             | Auth: magic link, onboarding, profil               | —                     | Zarchiwizowane                               |
| S-02       | savings-goals-lifecycle             | Cele oszczędnościowe: CRUD + celebracja + archiwum | yes                   | Run `/10x-implement savings-goals-lifecycle` |
| S-03       | manual-checkin-payments-projections | Manualny check-in, wpłaty & projekcje              | —                     | Zarchiwizowane                               |
| S-04       | ai-checkin-safety                   | AI check-in z walidacją + safety                   | —                     | Zarchiwizowane                               |
| S-05       | landing-page-unauthenticated        | Landing PL + redirect zalogowanych                 | —                     | Zarchiwizowane                               |
| S-06       | visual-language-polish              | Ciepły język wizualny w całej aplikacji            | yes                   | Run `/10x-plan visual-language-polish`       |
| S-07       | net-worth-panel                     | Panel wartości netto (aktywa, pasywa, staleness)   | —                     | Zarchiwizowane                               |

## Open Roadmap Questions

1. **Slogan produktu** — „Save up. Get saved." / „Odkładaj na cele. Świętuj każdy z nich." / inny? Owner: user. Block: roadmap-wide (cosmetic, nie blokuje żadnego slice'a).

## Parked

- **Wiele walut** — Why parked: PRD §Non-Goals. Tylko PLN.
- **AI poza check-inem** — Why parked: PRD §Non-Goals. AI = parser NL i nic więcej.
- **Import danych z banków** — Why parked: PRD §Non-Goals. Brak integracji bankowych.
- **Historia / snapshoty wartości netto** — Why parked: PRD §Non-Goals. Wartość netto to liczba aktualna, nie seria.
- **Wykresy w widoku szczegółów celu** — Why parked: PRD §Non-Goals. Brak wizualizacji trendów.
- **Aplikacja mobilna** — Why parked: PRD §Non-Goals. MVP jest web-only.
- **Cele emerytalne jako osobna kategoria** — Why parked: PRD §Non-Goals.
- **Kategorie pasywów** — Why parked: PRD §Non-Goals. Świadomy asymetryczny scope cut.
- **Tworzenie własnych kategorii aktywów** — Why parked: PRD §Non-Goals. Zamknięta lista.
- **Scenariusze „co by było gdyby"** — Why parked: PRD §Non-Goals. Brak suwaków, symulacji.
- **Hard delete celów** — Why parked: PRD §Non-Goals. Tylko soft delete (abandoned).
- **Automatyczne linkowanie wpłat z aktywami** — Why parked: PRD §Non-Goals.
- **Wymuszanie utworzenia pierwszego celu w onboardingu** — Why parked: PRD §Non-Goals. User może pominąć.

## Done

- **F-01: (foundation) Migracje włączone w konfiguracji Supabase, tabela `profiles` z polityką RLS (user widzi tylko swoje dane), wzorzec RLS udokumentowany dla kolejnych tabel.** — Archived 2026-06-23 → `context/archive/2026-06-10-supabase-schema-rls-baseline/`. Lesson: —.
- **S-01: Użytkownik może zarejestrować się i zalogować przez magic link (email-only), opcjonalnie podać imię i dane profilowe podczas onboardingu, edytować profil później, wylogować się z dowolnej strony.** — Archived 2026-06-23 → `context/archive/2026-06-11-auth-onboarding-profile/`. Lesson: —.
- **S-03: Użytkownik może zapisywać wpłaty manualnie (w tym zerowe miesiące i backdating), przeglądać/edytować/usuwać historię wpłat per cel, oraz widzieć wyliczone wymagane tempo, prognozowaną datę ukończenia i klasyfikację statusu (on track / behind / ahead) dla każdego celu.** — Archived 2026-06-23 → `context/archive/2026-06-23-manual-checkin-payments-projections/`. Lesson: —.
- **S-04: Użytkownik może wysłać zdanie w języku naturalnym (np. „500 na wakacje, 1000 na poduszkę"), zobaczyć propozycje wpłat sparsowane przez AI, zrecenzować/edytować je i zapisać — z walidacją inputu (limit 500 znaków, odrzucenie pustego), rate limitingiem, walidacją strukturalną odpowiedzi AI i graceful fallback do ścieżki manualnej przy awarii AI.** — Archived 2026-06-23 → `context/archive/2026-06-23-ai-checkin-safety/`. Lesson: —.
- **S-05: Niezalogowany użytkownik widzi polski landing z wartością produktu (cele, check-in, projekcja), sloganem i CTA „Zaloguj się"; zalogowany użytkownik trafia na dashboard (lub onboarding), nigdy nie widzi landingu.** — Archived 2026-06-23 → `context/archive/2026-06-23-landing-page-unauthenticated/`. Lesson: —.
- **S-07: Użytkownik może dodać/edytować/usunąć aktywa i pasywa, zobaczyć wartość netto (aktywa minus pasywa), potwierdzić że aktywo jest aktualne bez zmiany kwoty, oraz dostać łagodny prompt gdy dane są nieaktualne (>3 miesiące).** — Archived 2026-06-23 → `context/archive/2026-06-23-net-worth-panel/`. Lesson: —.
- **S-06: Użytkownik korzysta z aplikacji ze spójnym ciepłym językiem wizualnym: paleta, humanist sans-serif, zaokrąglone karty (12–16px), mikro-interakcje i łagodny ton prezentacji — zgodnie z PRD (motywująca forma, ciepły ton) i `shape-notes.md` §Forward: visual-language.** — Archived 2026-06-24 → `context/archive/2026-06-24-visual-language-polish/`. Lesson: —.
