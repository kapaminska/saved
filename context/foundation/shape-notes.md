---
project: "Saved!"
context_type: greenfield
created: 2026-05-22
updated: 2026-05-22
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "decision paralysis — user has money but can't decide how to split across goals or assess realism of plan"
    - topic: "core value prop"
      decision: "savings goals with projections are the core; net worth panel is motivational context, not the reason someone opens the app"
    - topic: "insight"
      decision: "one NL sentence per month is enough to maintain savings discipline; people abandon budgeting because of friction, not lack of intent"
    - topic: "user model"
      decision: "flat — every logged-in user sees their own data, no roles; 'w związku' flag affects UI labels only, not access"
  frs_drafted: 35
  quality_check_status: accepted
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Brak prostego sposobu na śledzenie wielu celów oszczędnościowych jednocześnie z poczuciem postępu i realistyczną prognozą. Użytkownik ma pieniądze do odłożenia, ale nie wie jak je rozdzielić między cele ani czy plan jest realistyczny. Istniejące narzędzia (arkusze, notatki, aplikacje budżetowe) wymagają zbyt dużo wysiłku — ludzie porzucają śledzenie z powodu frikcji, nie z braku chęci oszczędzania.

Insight: jedno zdanie w naturalnym języku raz w miesiącu wystarczy, żeby utrzymać dyscyplinę oszczędzania. Aplikacja zamienia tę jedną linijkę na strukturalne wpłaty, aktualizuje postęp i pokazuje prognozę — minimalna frikcja przy maksymalnej informacji zwrotnej. Panel wartości netto (aktywa minus pasywa) pełni rolę motywacyjnego kontekstu („coś się zdziałało w życiu"), nie jest rdzeniem produktu.

## User & Persona

Osoba oszczędzająca na konkretne cele (wakacje, poduszka finansowa, sprzęt), która chce mieć motywujący obraz postępu i realistyczny plan. Moment: koniec miesiąca — chwila na check-in, ile odłożyłam, na co, czy tempo się trzyma. Dziś radzi sobie arkuszem, notatkami lub niczym — brak projekcji, brak struktury przy wielu celach naraz.

## Access Control

Magic link (email-only) — bez Google OAuth, bez hasła. Flat user model — każdy zalogowany użytkownik widzi wyłącznie swoje dane. Brak ról (admin, member, guest). Flag „w związku małżeńskim" wpływa tylko na etykiety w UI („Twoja" vs „Wasza" wartość netto), nie na kontrolę dostępu. Niezalogowany użytkownik widzi mini-landing z przyciskiem logowania.

## Success Criteria

### Primary
- Użytkownik definiuje cel oszczędnościowy, robi miesięczny check-in (AI lub manualnie), widzi zaktualizowany postęp z projekcją i klasyfikacją statusu. Pełna pętla działa end-to-end.

### Secondary
- Panel wartości netto (aktywa minus pasywa) działa jako kontekst motywacyjny obok celów oszczędnościowych.

### Guardrails
- AI failure never blocks the user — manual fallback musi działać zawsze, niezależnie od dostępności AI.
- Data integrity — zapisany check-in nigdy nie gubi, nie duplikuje i nie przypisuje błędnie wpłaty. Zero tolerancji dla korupcji danych finansowych.
- Privacy — user A nigdy nie widzi danych user B. Izolacja danych per użytkownik jest bezwzględna.

## Functional Requirements

### Authentication & Onboarding

- FR-001: User can log in via magic link (email-only). Priority: must-have
  > Socrates: Counter-argument: magic link is simpler than OAuth. Resolution: revised from Google OAuth to magic link — simpler, no third-party dependency.
- FR-002: User can optionally enter their name during onboarding. Priority: must-have
  > Socrates: No counter-argument; stands as written.
- FR-003: User can optionally fill profile data (date of birth, retirement age, relationship status) during onboarding. Priority: must-have
  > Socrates: Counter-argument: asking for income/DOB during onboarding feels invasive. Resolution: revised — income field dropped; remaining fields kept as optional.
- FR-004: If user account exists, app skips to dashboard instead of replaying onboarding. Priority: must-have
  > Socrates: Counter-argument: resume logic adds state management complexity for rare edge case. Resolution: revised — skip to dashboard, user fills gaps organically via profile page and "Add goal" button.

### Savings Goals

- FR-005: User can create a savings goal (name, target amount, optional deadline). Priority: must-have
  > Socrates: Counter-argument: requiring deadline forces premature commitment on open-ended goals (e.g. emergency fund). Resolution: revised — deadline optional; goals without deadline show only total saved, no projection/pace.
- FR-006: User can edit an active goal's name, target amount, and deadline. Priority: must-have
  > Socrates: Counter-argument: editing target amount breaks projection trust. Resolution: kept; warning ("this affects progress and projection") makes cost visible.
- FR-007: User can soft-delete a goal (status → abandoned), preserving data. Priority: must-have
  > Socrates: Counter-argument: abandoned goals clutter the archive. Resolution: kept; archive separates completed vs abandoned visually.
- ~~FR-008: DROPPED — User can restore an abandoned or completed goal to active.~~
  > Socrates: Counter-argument: restoring a completed goal undermines the celebration moment. Resolution: dropped from MVP. User creates a new goal instead.
- FR-009: App automatically marks a goal as completed when progress reaches 100%. Priority: must-have
  > Socrates: No counter-argument; stands as written.
- FR-010: App shows a celebration moment (message + soft confetti) on goal completion. Priority: must-have
  > Socrates: Counter-argument: confetti risks looking unserious on portfolio piece. Resolution: kept — celebration IS the brand moment ("Saved!").

### Monthly Check-in

- FR-011: User can submit a monthly check-in as a natural language sentence, parsed by AI into structured payments assigned to goals. Priority: must-have
  > Socrates: Counter-argument: AI adds cost + latency for a task that takes 10 seconds manually with few goals. Resolution: kept — NL check-in is the product's core bet (minimal friction insight).
- FR-012: User can submit a check-in manually (without AI) as a fallback. Priority: must-have
  > Socrates: No counter-argument; stands as written. Manual fallback is a guardrail.
- FR-013: User can review and edit AI-proposed payments before saving (change amount, reassign goal, remove). Priority: must-have
  > Socrates: Counter-argument: review undermines "one sentence and done". Resolution: kept — review is non-negotiable for financial data integrity.
- FR-014: Unrecognized goal names in AI check-in are flagged; user creates the goal separately (not inline). Priority: must-have
  > Socrates: Counter-argument: inline goal creation bloats check-in flow. Resolution: revised — dropped inline creation; unrecognized names flagged, goal created outside check-in.
- FR-015: User can explicitly confirm a zero month OR simply skip the check-in; both count as 0 in projection. Priority: must-have
  > Socrates: Counter-argument: confirming zero feels punitive. Resolution: revised — both explicit zero and no check-in are valid paths, both = 0 in projection.
- FR-016: User can change the check-in month (default: current; past allowed, future blocked). Priority: must-have
  > Socrates: Counter-argument: backdating enables gaming and messy data. Resolution: kept — real life requires backdating; people forget check-ins.

### AI Input & Output Safety

- FR-032: Check-in text is limited to 500 characters. Input exceeding the limit is rejected with a visible message before reaching AI. Priority: must-have
- FR-033: Empty or whitespace-only check-in input is rejected before reaching AI. Priority: must-have
- FR-034: AI check-in requests per user are rate-limited. When the limit is exceeded, user sees a message and a link to the manual check-in path. Priority: must-have
- FR-035: AI-proposed amounts must be positive numbers; proposed goal names must match the user's existing active goals. Payments failing either condition are excluded from the review screen. Priority: must-have
- FR-036: AI response is structurally validated before being shown to the user. An invalid response is treated as AI unavailability (manual fallback). Priority: must-have

### Projections & Status

- FR-017: App calculates required pace per goal: (target − saved) / months remaining. Priority: must-have
  > Socrates: Counter-argument: required pace is demoralizing when user is behind. Resolution: kept — honest math is the point. Tone can soften the presentation.
- FR-018: App projects goal completion date from average monthly payments, labeled "based on N months of data". Priority: must-have
  > Socrates: Counter-argument: early projections are wildly inaccurate (1–2 data points). Resolution: revised — projection always shown but labeled with data-point count so user judges reliability.
- FR-019: App classifies each goal's status: on track / behind / ahead. Priority: must-have
  > Socrates: Counter-argument: five statuses is over-engineered for MVP. Resolution: revised — simplified from 5 to 3 statuses.

### Payment History

- FR-020: User can view payment history per goal (including zero months). Priority: must-have
  > Socrates: Counter-argument: showing zero months is clutter. Resolution: kept — honest data shows the real pattern.
- FR-021: User can inline-edit a payment's amount and month. Priority: must-have
  > Socrates: Counter-argument: editing past payments distorts projection history. Resolution: kept — recalculation is instant, corrections matter more than historical accuracy.
- FR-022: User can hard-delete a payment. Priority: must-have
  > Socrates: No counter-argument; stands as written. Payments are atoms — delete + recreate is the fix for misassignment.

### Net Worth Panel

- FR-023: User can add, edit, and remove assets (name, amount, category from closed list: cash / savings / investments / real estate / other). Priority: must-have
  > Socrates: Counter-argument: fixed category list is too rigid. Resolution: kept — "other" covers edge cases; custom categories are scope creep for MVP.
- FR-024: User can add, edit, and remove liabilities (name, amount). Priority: must-have
  > Socrates: Counter-argument: liabilities without categories feel incomplete. Resolution: kept — asymmetry is a conscious scope cut for MVP.
- FR-025: App displays net worth (sum of assets minus liabilities). Priority: must-have
  > Socrates: Counter-argument: negative net worth is demoralizing. Resolution: kept — honest math, no sugarcoating.
- FR-026: User can mark an asset as "current" (refreshes last_updated_at without changing amount). Priority: must-have
  > Socrates: Counter-argument: micro-interaction few users will use. Resolution: kept — serves staleness prompt (FR-027); without it, dismissing the prompt requires re-entering the same value.
- FR-027: App shows a soft prompt when any asset's last_updated_at exceeds 3 months. Priority: must-have
  > Socrates: Counter-argument: nagging about stable assets (real estate) is noise. Resolution: kept — one banner triggered by oldest asset, not per-asset nag. Dismissable.

### Profile & Auth

- FR-028: User can view and edit all profile fields from a dedicated profile page. Priority: must-have
  > Socrates: Counter-argument: profile page is a dead screen rarely visited after setup. Resolution: kept — low cost, necessary for completeness.
- FR-029: User can log out from any page. Priority: must-have
  > Socrates: No counter-argument; stands as written.

### Archive

- FR-030: User can view completed and abandoned goals in an archive section. Priority: must-have
  > Socrates: Counter-argument: archive is a dead screen in early months. Resolution: kept — part of goal lifecycle; without it, completed/abandoned goals vanish.

### Registration

- FR-031: App registers a new user record in the database on first magic-link login. Priority: must-have
  > Socrates: No counter-argument; stands as written.

## User Stories

### US-01: Miesięczny check-in z AI

- **Given** zalogowany użytkownik z co najmniej jednym aktywnym celem
- **When** klika „Zrób check-in" i wpisuje zdanie np. „500 na wakacje, 1000 na poduszkę"
- **Then** AI parsuje tekst na strukturalne wpłaty przypisane do celów, użytkownik widzi ekran review, może edytować/usunąć, po zapisaniu wraca na dashboard ze zaktualizowanym postępem, projekcją i statusem

#### Acceptance Criteria
- Każda wpłata z review trafia do właściwego celu
- Nierozpoznana nazwa celu → flagowana, user tworzy cel osobno (nie inline)
- Po zapisaniu: pasek postępu, projekcja i plakietka statusu odzwierciedlają nowe dane
- Jeśli AI niedostępne lub zwróci błąd → user widzi link do ścieżki manualnej, nigdy nie jest zablokowany

## Business Logic

Aplikacja zamienia jedno zdanie w naturalnym języku na strukturalne wpłaty przypisane do celów, wylicza tempo, projekcję i status każdego celu, i prezentuje postęp w motywującej formie, która nagradza systematyczność (celebracja osiągnięć, widoczny progres, ciepły ton).

Pięć decyzji domenowych:

1. **Parser AI** — przyjmuje zdanie użytkownika (np. „500 na wakacje, 1000 na poduszkę"), rozpoznaje kwoty i nazwy celów, zwraca strukturalne wpłaty z przypisaniem do istniejących celów. Nierozpoznane nazwy są flagowane.

2. **Wymagane tempo** — (kwota docelowa − odłożone) / liczba miesięcy do deadline. Działa od pierwszej sekundy istnienia celu (jeśli cel ma deadline). Cele bez deadline nie mają wymaganego tempa.

3. **Projekcja** — średnia miesięcznych wpłat z całej historii celu ekstrapolowana na pozostały czas. Miesiące bez check-inu i jawne zera liczą się jako 0 zł w średniej (oba traktowane równo). Etykieta „na podstawie N miesięcy danych" informuje o wiarygodności.

4. **Klasyfikacja statusu** — porównanie projekcji z deadline: on track / behind / ahead. Trzy statusy. Cele bez deadline mają tylko „open-ended" (brak klasyfikacji).

5. **Monitorowanie wieku aktywów** — jeśli last_updated_at najstarszego aktywa przekracza 3 miesiące, jeden banner z propozycją aktualizacji. Dismissable.

## Non-Functional Requirements

- Użytkownik widzi reakcję na lokalne akcje (zapis celu, edycja wpłaty) w czasie poniżej 200 ms. Operacje wymagające AI (parsowanie check-inu) pokazują widoczny stan ładowania z ciągłym feedbackiem.
- Dane użytkownika nie są nigdy dostępne dla innych użytkowników ani bez uwierzytelnienia. Ścisła izolacja danych per użytkownik.
- Produkt działa na najnowszych wersjach Chrome, Firefox, Safari i Edge. Brak wymagań dla starszych przeglądarek ani optymalizacji mobilnych.
- Niedostępność AI oznacza degradację funkcji (brak parsowania NL), nie awarię produktu. Wszystkie nie-AI funkcje działają bez zmian, bez utraty danych.
- Odpowiedź AI nigdy nie jest zapisywana do bazy bez przejścia walidacji strukturalnej i domenowej. Malformowana odpowiedź AI nie może spowodować korupcji danych finansowych.

## Non-Goals

- Wiele walut — tylko PLN. Brak konwersji walutowej, brak obsługi USD/EUR.
- AI poza check-inem — brak coacha motywacyjnego, analizy wzorców, porad oszczędnościowych. AI = parser NL i nic więcej.
- Import danych z banków — brak API bankowych, skanowania paragonów, automatycznego importu transakcji.
- Historia / snapshoty wartości netto — brak wykresów czasowych. Wartość netto to liczba aktualna, nie seria historyczna.
- Wykresy w widoku szczegółów celu — brak wizualizacji trendów wpłat.
- Aplikacja mobilna — MVP jest web-only (chyba że stack to ułatwi — decyzja downstream).
- Cele emerytalne jako osobna kategoria — mimo zbierania daty urodzenia, brak specjalnego trybu emerytalnego.
- Kategorie pasywów — świadomy asymetryczny scope cut (aktywa mają kategorie, pasywa nie).
- Tworzenie własnych kategorii aktywów — zamknięta lista (gotówka / oszczędności / inwestycje / nieruchomości / inne).
- Scenariusze „co by było gdyby" — brak suwaków, wariantów prognozy, symulacji.
- Hard delete celów — tylko soft delete (status → abandoned).
- Automatyczne linkowanie wpłat z aktywami.
- Wymuszanie utworzenia pierwszego celu w onboardingu — user może pominąć.

## Forward: tech-stack

Stack otwarty — do ustalenia downstream po zatwierdzeniu PRD. Seed wspomina Supabase / Clerk / NextAuth jako przykłady providerów auth, ale to nie jest commitment. Wybór ma wspierać projekt, nie zastępować decyzji o projekcie.

## Forward: visual-language

Seed opisuje szczegółowy język wizualny (ciepła paleta, humanist sans-serif, zaokrąglone karty 12-16px, mikro-interakcje). Te decyzje nie wchodzą do PRD — są forward-looking context dla implementacji.

## Open Questions

1. **Konkretne progi klasyfikacji statusu** — jak dokładnie definiujemy "on track" vs "behind" vs "ahead"? Procentowe odchylenie od wymaganego tempa? Owner: user. Block: no (implementacja może użyć rozsądnych defaults).
2. **Slogan** — "Save up. Get saved." / "Odkładaj na cele. Świętuj każdy z nich." / inny? Owner: user. Block: no.
3. **Hard limit długości nazwy celu** — techniczny limit formularza/schemy. Owner: downstream (stack selection). Block: no.
