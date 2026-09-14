---
title: "Saved! — destylacja domeny"
created: 2026-09-14
type: domain-distillation
sources:
  - context/foundation/prd.md
  - context/foundation/shape-notes.md
  - context/foundation/tech-stack.md
  - context/foundation/roadmap.md
  - README.md
  - context/archive/2026-06-23-manual-checkin-payments-projections/plan.md
limitation: null
---

# Destylacja domeny: Saved!

Produkt mapy: język wszechobecny, klasyfikacja subdomen, kandydaci na agregaty i rozjazdy MODEL vs KOD. Bez kodu produkcyjnego. Wszystkie cytaty i ścieżki zostały zweryfikowane w źródłach.

## Krok 0 — Kontekst projektu

Dokumenty wizji i wymagań **istnieją**. Kanonicznym źródłem domeny jest `context/foundation/prd.md` (v1, status: draft, 2026-05-22). Uzupełniają je `context/foundation/shape-notes.md` (ta sama narracja + checkpoint shaping), `README.md` (wizja produktu w korzeniu), `context/foundation/tech-stack.md`, `context/foundation/roadmap.md` oraz zarchiwizowane plany zmian (m.in. S-03: check-in / wpłaty / projekcje). Memory Bank (`memory-bank/`) **nie istnieje**.

**Problem i insight** (wizja): użytkownik ma pieniądze do odłożenia, ale nie wie, jak je rozdzielić między wiele celów ani czy plan jest realistyczny. Ludzie porzucają śledzenie z powodu tarcia, nie z braku chęci. Jedno zdanie w naturalnym języku raz w miesiącu ma wystarczyć, by utrzymać dyscyplinę — aplikacja zamienia je na strukturalne wpłaty, postęp i prognozę. Panel wartości netto jest motywacyjnym kontekstem, **nie rdzeniem**.

**Stack** (README + tech-stack): Astro 6 SSR, React 19 (wyspy), Tailwind 4, Supabase (auth + Postgres + RLS), Cloudflare Workers (`@astrojs/cloudflare`). AI check-in idzie przez binding Workers AI.

**Gdzie żyje logika biznesowa — odkryta struktura repo:**

| Warstwa | Gdzie | Uwaga DDD |
| --- | --- | --- |
| UI | `src/pages/*.astro`, `src/components/{goals,net-worth,profile,auth}/` | Astro SSR + wyspy React; etykiety domenowe (status, celebracja, banner stale) siedzą w UI |
| API (aplikacja) | `src/pages/api/{check-in,goals,assets,liabilities,profile,auth}/` | Handlery POST; tu dzieje się orkiestracja (upsert wpłat, recalk, abandon) |
| „Serwis” / helpery | `src/lib/goals/`, `src/lib/net-worth/`, `src/lib/profile/`, `src/lib/i18n/` | Czyste funkcje (projekcja, walidacja) + adaptery (parse AI, rate-limit, sync `saved_amount`) |
| Domena jako warstwa | — | **BRAK** `src/domain/` / agregatów / encji z niezmiennikami. Reguły rozproszone między SQL, helperami i handlerami |
| Persystencja | `supabase/migrations/`, typy `src/types/database.ts` | Tabele + RLS + jeden trigger ukończenia celu |
| Auth / middleware | `src/middleware.ts`, `src/lib/supabase.ts` | Sesja cookie, `PROTECTED_ROUTES`, izolacja przez RLS |

Wniosek architektoniczny: to **CRUD + funkcje obliczeniowe**, nie model domenowy. Najcenniejsze reguły (całość check-inu, spójność `saved_amount`, „jedna wpłata na cel×miesiąc”) nie mają jawnej granicy spójności w kodzie.

---

## Krok 1 — Ubiquitous Language

Pojęcia wyciągnięte z dokumentów **oraz** z kodu. Nic nie zostało nazwane „na zapas”.

### 1. Cel oszczędnościowy (`savings_goals`)

- **Definicja:** nazwany plan odkładania z kwotą docelową i opcjonalnym terminem; może być aktywny, ukończony albo porzucony.
- **Źródło:** „User can create a savings goal (name, target amount, optional deadline).” — `context/foundation/prd.md:74`
- **Kod:** tabela `public.savings_goals` — `supabase/migrations/20260623120000_create_savings_goals.sql:2-13`; wstawianie — `src/pages/api/goals/index.ts:50-59`

### 2. Kwota docelowa (`target_amount`)

- **Definicja:** dodatnia kwota, do której dąży cel.
- **Źródło:** FR-005, `context/foundation/prd.md:74`
- **Kod:** CHECK `target_amount > 0` — `supabase/migrations/20260623120000_create_savings_goals.sql:6`; parser — `src/lib/goals/validation.ts:16-28`

### 3. Odłożone / postęp (`saved_amount`)

- **Definicja:** bieżąca suma odłożona na cel; przy 100% celu aplikacja automatycznie oznacza go jako ukończony.
- **Źródło:** FR-009 „App automatically marks a goal as completed when progress reaches 100%.” — `context/foundation/prd.md:81`; tempo: „(target − saved) / months remaining” — `context/foundation/prd.md:112`
- **Kod:** kolumna `saved_amount` — `supabase/migrations/20260623120000_create_savings_goals.sql:7`; przeliczenie w aplikacji — `src/lib/goals/sync-saved-amount.ts:29-34`; trigger ukończenia — `supabase/migrations/20260623120000_create_savings_goals.sql:37-44`

### 4. Kwota początkowo odłożona (`opening_saved_amount`)

- **Definicja (z kodu):** saldo startowe celu, **nie** będące wierszem wpłaty; `saved_amount = opening_saved_amount + Σ wpłat`.
- **Źródło dokumentowe:** **BRAK w PRD / shape-notes / README.** Pojawia się dopiero w migracji i API.
- **Kod:** `supabase/migrations/20260623150000_add_opening_saved_amount.sql:1-3`; recalk — `src/lib/goals/sync-saved-amount.ts:29-30`; create — `src/pages/api/goals/index.ts:56-57`

### 5. Termin (`deadline`)

- **Definicja:** opcjonalna data; bez niej cel nie ma wymaganego tempa ani klasyfikacji statusu (w PRD: „open-ended”).
- **Źródło:** FR-005 Socrates: „deadline optional; goals without deadline show only total saved, no projection/pace.” — `context/foundation/prd.md:75`
- **Kod:** kolumna `deadline date` — `supabase/migrations/20260623120000_create_savings_goals.sql:8`; parser normalizuje do 1. dnia miesiąca — `src/lib/goals/validation.ts:46-70`

### 6. Status cyklu życia celu (`active` / `completed` / `abandoned`)

- **Definicja:** aktywny można edytować i zasilając wpłatami; ukończony = postęp ≥ 100%; porzucony = świadome zejście z planu z zachowaniem danych. **Przywracanie do active jest poza MVP.**
- **Źródło:** FR-007, FR-009; FR-008 DROPPED — `context/foundation/prd.md:76-81`; Non-Goals: „goals are only abandoned, never destroyed.” — `context/foundation/prd.md:198`
- **Kod:** CHECK `status in ('active', 'completed', 'abandoned')` — `supabase/migrations/20260623120000_create_savings_goals.sql:9`; abandon — `src/pages/api/goals/[id]/abandon.ts:40-48`; edycja tylko `active` — `src/pages/api/goals/[id].ts:47-48`. **BRAK** endpointu restore. **BRAK** endpointu usuwania celu.

### 7. Celebracja („Saved!”)

- **Definicja:** moment brandowy przy ukończeniu celu: wiadomość + miękkie confetti.
- **Źródło:** FR-010 — `context/foundation/prd.md:83-85`
- **Kod:** `src/components/goals/CelebrationModal.tsx:12-28`; dashboard otwiera modal po `?celebrated=` — `src/pages/dashboard.astro:18`, `src/pages/dashboard.astro:261`

### 8. Archiwum

- **Definicja:** osobna sekcja ukończonych i porzuconych celów, rozdzielona wizualnie.
- **Źródło:** FR-030 — `context/foundation/prd.md:149-151`
- **Kod:** `src/pages/goals/archive.astro:11-25`, etykiety Ukończone/Porzucone — `src/pages/goals/[id]/index.astro:34-38`

### 9. Check-in miesięczny

- **Definicja:** comiesięczny akt rozliczenia: „ile odłożyłam, na co”. Domyślnie bieżący miesiąc; przeszłość dozwolona; przyszłość zablokowana. Może być AI albo ręczny.
- **Źródło:** persona „koniec miesiąca — chwila na check-in” — `context/foundation/prd.md:26`; FR-016 — `context/foundation/prd.md:99`; US-01 — `context/foundation/prd.md:46-50`
- **Kod (przypadek użycia, nie encja):** `src/pages/api/check-in.ts:15-115`; walidacja miesiąca — `src/lib/goals/payment-validation.ts:57-75`. **BRAK tabeli `check_ins`.** Zapis to zestaw wpłat.

### 10. Check-in z AI / parser języka naturalnego

- **Definicja:** zdanie użytkownika (np. „500 na wakacje, 1000 na poduszkę”) zamieniane na strukturalne wpłaty przypisane do **istniejących aktywnych** celów. To **core bet** produktu. AI = wyłącznie parser NL, nic więcej.
- **Źródło:** Business Logic pkt 1 — `context/foundation/prd.md:172`; FR-011 — `context/foundation/prd.md:89-90`; Non-Goals: „AI = parser NL i nic więcej.” — `context/foundation/prd.md:189`; roadmap north star S-04 — `context/foundation/roadmap.md:24`
- **Kod:** `src/lib/goals/ai-checkin/parse-checkin.ts:34-47`, `78-136`; endpoint — `src/pages/api/check-in/parse.ts:13-89`

### 11. Check-in ręczny (manual fallback)

- **Definicja:** ta sama operacja zapisu wpłat bez AI. Guardrail: awaria AI nigdy nie blokuje użytkownika.
- **Źródło:** Guardrails — `context/foundation/prd.md:40`; FR-012 — `context/foundation/prd.md:91-92`
- **Kod:** formularz — `src/components/goals/ManualCheckInForm.tsx:23-119`; ten sam POST `/api/check-in` — `src/pages/api/check-in.ts:15`; fallback UI — `src/components/goals/AiCheckInTab.tsx:106-109`

### 12. Ekran review (propozycje AI)

- **Definicja:** zanim cokolwiek trafi do bazy, użytkownik widzi sparsowane wpłaty, może zmienić kwotę, przepiąć cel albo usunąć pozycję. Review jest „non-negotiable for financial data integrity”.
- **Źródło:** FR-013 — `context/foundation/prd.md:93-94`; US-01 Then — `context/foundation/prd.md:50`
- **Kod:** stan `view === "review"` — `src/components/goals/AiCheckInTab.tsx:187-298`; zapis idzie do `/api/check-in`, nie do `/parse` — `src/components/goals/AiCheckInTab.tsx:157-161`. Parse **nie** wstawia `goal_payments`.

### 13. Propozycja wpłaty vs nierozpoznana nazwa celu

- **Definicja:** kwota + nazwa celu z tekstu. Jeśli nazwa nie mapuje się na aktywny cel, jest **flagowana**; użytkownik tworzy cel **osobno (nie inline)**.
- **Źródło:** FR-014 — `context/foundation/prd.md:95-96`; FR-035 — `context/foundation/prd.md:107`
- **Kod:** `ParsedProposal` / `UnrecognizedEntry` — `src/lib/goals/ai-checkin/parse-checkin.ts:6-16`; matching — `src/lib/goals/ai-checkin/goal-name-match.ts:64-94`; UI flagi — `src/components/goals/AiCheckInTab.tsx:250-266` („Utwórz ten cel osobno”)

### 14. Wpłata (`goal_payments`) — „atom”

- **Definicja:** kwota przypisana do konkretnego celu i miesiąca. Można inline edytować kwotę i miesiąc oraz trwale usunąć. PRD: „Payments are atoms — delete + recreate is the fix for misassignment.”
- **Źródło:** FR-020–FR-022 — `context/foundation/prd.md:121-126`
- **Kod:** tabela — `supabase/migrations/20260623140000_create_goal_payments.sql:2-11`; edycja — `src/pages/api/goals/[id]/payments/[paymentId].ts:15-107`; usuwanie — `src/pages/api/goals/[id]/payments/[paymentId]/delete.ts:14-74`

### 15. Jedna wpłata na (cel × miesiąc)

- **Definicja (z planu S-03, nie z PRD):** „One row per goal per calendar month.” / „Multiple payment rows per goal per month” jest poza zakresem.
- **Źródło:** `context/archive/2026-06-23-manual-checkin-payments-projections/plan.md:22`, `36`, `73`
- **Kod:** `UNIQUE (goal_id, payment_month)` — `supabase/migrations/20260623140000_create_goal_payments.sql:10`; check-in **nadpisuje** przez upsert — `src/pages/api/check-in.ts:83-90`

### 16. Miesiąc zerowy vs pominięcie

- **Definicja:** użytkownik może **jawnie** potwierdzić 0 zł albo **pominąć** check-in; oba liczą się jako 0 w projekcji. Puste pole ≠ zero.
- **Źródło:** FR-015 — `context/foundation/prd.md:97-98`; Business Logic pkt 3 — `context/foundation/prd.md:176`
- **Kod:** przycisk „0” vs placeholder „Pomiń, jeśli puste” — `src/components/goals/ManualCheckInForm.tsx:34-36`, `81`, `94`; handler pomija puste, zapisuje `"0"` — `src/pages/api/check-in.ts:48-50`; testy — `src/pages/api/check-in.test.ts:165-198`; średnia z lukami = 0 — `src/lib/goals/projection.ts:101-118`

### 17. Wymagane tempo (`requiredPace`)

- **Definicja:** `(kwota docelowa − odłożone) / liczba miesięcy do deadline`. Działa od pierwszej sekundy istnienia celu **jeśli jest deadline**. Bez deadline — brak tempa.
- **Źródło:** FR-017 — `context/foundation/prd.md:112`; Business Logic pkt 2 — `context/foundation/prd.md:174`
- **Kod:** `src/lib/goals/projection.ts:121-140`; UI — `src/pages/dashboard.astro:207-211`

### 18. Projekcja daty ukończenia

- **Definicja:** średnia miesięcznych wpłat z historii celu, ekstrapolowana na pozostały czas; etykieta „na podstawie N miesięcy danych”.
- **Źródło:** FR-018 — `context/foundation/prd.md:114-115`; Business Logic pkt 3 — `context/foundation/prd.md:176`
- **Kod:** `averageMonthlyPayment` + `projectedCompletionDate` — `src/lib/goals/projection.ts:94-157`; etykieta — `src/pages/dashboard.astro:212-218`

### 19. Klasyfikacja tempa: on track / behind / ahead / open-ended

- **Definicja:** porównanie **projekcji z deadline**: trzy statusy. Cele bez deadline mają tylko „open-ended” (brak klasyfikacji). Progi procentowe w PRD są **otwartym pytaniem**.
- **Źródło:** FR-019 — `context/foundation/prd.md:116-117`; Business Logic pkt 4 — `context/foundation/prd.md:178`; Open Questions — `context/foundation/prd.md:204`
- **Kod:** `GoalStatus = "ahead" | "on_track" | "behind"` — `src/lib/goals/projection.ts:6`; `goalStatus` porównuje daty — `src/lib/goals/projection.ts:159-172`; plakietki PL — `src/components/goals/GoalStatusBadge.tsx:8-20`. **BRAK** wartości `"open-ended"` w kodzie — brak deadlinu → `null`, badge się nie renderuje (`GoalStatusBadge.tsx:23-24`).

### 20. Wartość netto

- **Definicja:** suma aktywów minus pasywa; liczba **aktualna**, nie seria historyczna. Secondary success criterion, nie rdzeń.
- **Źródło:** Vision — `context/foundation/prd.md:22`; FR-025 — `context/foundation/prd.md:134`; Non-Goals — `context/foundation/prd.md:191`
- **Kod:** `src/lib/net-worth/compute.ts:5-8`

### 21. Aktywo (`assets`)

- **Definicja:** nazwa, kwota, kategoria z zamkniętej listy: cash / savings / investments / real estate / other. Potwierdzenie „nadal aktualne” odświeża datę bez zmiany kwoty.
- **Źródło:** FR-023, FR-026 — `context/foundation/prd.md:130`, `136`; Non-Goals zamknięta lista — `context/foundation/prd.md:196`
- **Kod:** CHECK kategorii — `supabase/migrations/20260623170000_create_assets_and_liabilities.sql:3-8`; `ASSET_CATEGORIES` — `src/lib/net-worth/validation.ts:6`; confirm — `src/pages/api/assets/[id]/confirm.ts:41-43`

### 22. Pasywo (`liabilities`)

- **Definicja:** nazwa i kwota; **bez kategorii** (świadomy cut).
- **Źródło:** FR-024 — `context/foundation/prd.md:132`; Non-Goals — `context/foundation/prd.md:195`
- **Kod:** `supabase/migrations/20260623170000_create_assets_and_liabilities.sql:14-21`; **BRAK** kolumny `category`

### 23. Wiek aktywa / banner nieaktualności

- **Definicja:** jeśli najstarsze aktywo nie było aktualizowane > 3 miesiące, **jeden** dismissable banner.
- **Źródło:** FR-027 + Business Logic pkt 5 — `context/foundation/prd.md:138-139`, `180`
- **Kod:** `isAssetStale` / `getStalestAsset` — `src/lib/net-worth/compute.ts:11-27`; banner — `src/components/net-worth/StaleAssetBanner.tsx:29-41`

### 24. Profil użytkownika (płaski model)

- **Definicja:** opcjonalne imię, data urodzenia, wiek emerytalny, status związku. Flag „w związku” zmienia **tylko etykiety** wartości netto („Twoja” vs „Wasza”), nie uprawnienia. Brak ról.
- **Źródło:** Access Control — `context/foundation/prd.md:184`; FR-002–FR-003, FR-028 — `context/foundation/prd.md:65-68`, `143`
- **Kod:** tabela `profiles` — `supabase/migrations/20260610120000_create_profiles.sql:2-10`; etykieta — `src/lib/net-worth/compute.ts:29-33`; statusy — `src/pages/api/profile.ts:5`. Non-Goals: brak trybu emerytalnego mimo zbierania DOB — `context/foundation/prd.md:194`

### 25. Logowanie magic link / OTP; konto przy pierwszym logowaniu

- **Definicja (PRD):** email-only magic link, bez hasła, bez OAuth. Nowe konto przy pierwszym logowaniu.
- **Źródło:** FR-001, FR-031 — `context/foundation/prd.md:63-64`, `155`
- **Kod:** `signInWithOtp` + `shouldCreateUser: true` — `src/pages/api/auth/send-otp.ts:24-29`; README nazywa to **kodem OTP**, nie magic linkiem — `README.md:70`. Trigger `handle_new_user` tworzy `profiles` — `supabase/migrations/20260610120000_create_profiles.sql:37-50`

### 26. Izolacja danych per użytkownik

- **Definicja:** user A nigdy nie widzi danych user B. Flat user model.
- **Źródło:** Guardrails Privacy — `context/foundation/prd.md:42`; NFR — `context/foundation/prd.md:161`
- **Kod:** RLS `auth.uid() = user_id` na celach — `supabase/migrations/20260623120000_create_savings_goals.sql:19-26`; analogicznie wpłaty/aktywa/pasywa; middleware — `src/middleware.ts:40-42`

### 27. PLN (jedyna waluta)

- **Definicja:** tylko PLN; brak konwersji.
- **Źródło:** Non-Goals — `context/foundation/prd.md:188`
- **Kod:** formatowanie `currency: "PLN"` — `src/lib/i18n/format.ts:3-10`. **BRAK** kolumny waluty w schemacie (założenie niejawne).

### 28. Limit 500 znaków, puste odrzucenie, rate-limit AI

- **Definicja:** tekst check-inu ≤ 500 znaków; pusty/whitespace odrzucany **zanim** dotrze do AI; przekroczenie limitu żądań → komunikat + link do ścieżki ręcznej.
- **Źródło:** FR-032–FR-034 — `context/foundation/prd.md:104-106`
- **Kod:** `MAX_CHECKIN_TEXT_LENGTH = 500` — `src/lib/goals/ai-checkin/nl-input-validation.ts:1-17`; limit 10 / 3600 s — `src/lib/goals/ai-checkin/rate-limit.ts:3-10`; tabela `ai_checkin_requests` — `supabase/migrations/20260623160000_create_ai_checkin_requests.sql:2-6`; 429 — `src/pages/api/check-in/parse.ts:38-48`

### 29. Walidacja strukturalna odpowiedzi AI

- **Definicja:** malformowana odpowiedź = niedostępność AI (fallback ręczny), nigdy zapis do bazy finansowej.
- **Źródło:** FR-036 + NFR — `context/foundation/prd.md:108`, `164`
- **Kod:** Zod `amount.gt(0)` — `src/lib/goals/ai-checkin/parse-schema.ts:3-10`; nieparsowalne → `invalid_response` → 503 `AI_UNAVAILABLE` — `src/lib/goals/ai-checkin/parse-checkin.ts:106-108`; `src/pages/api/check-in/parse.ts:71-80`

---

## Krok 2 — Klasyfikacja subdomen

Oś: **rdzeń = to, bez czego produkt jest „zwykłym arkuszem”** (roadmap: parsowanie NL + pętla cel → check-in → projekcja/status). Secondary = wartość netto. Non-goals i auth to nie przewaga.

| Obszar / pojęcia | Klasa | Uzasadnienie z celów produktu |
| --- | --- | --- |
| Cel oszczędnościowy, kwota docelowa, odłożone, deadline, cykl `active/completed/abandoned`, celebracja, archiwum | **Core** | Primary Success Criterion: „definiuje cel… widzi zaktualizowany postęp” (`prd.md:32`). Bez celów nie ma produktu. |
| Check-in miesięczny (AI + ręczny), review, propozycje, nierozpoznane nazwy, wpłata-atom, miesiąc zerowy / pominięcie, zakaz przyszłości | **Core** | „NL check-in is the product's core bet” (`prd.md:90`); US-01; north star S-04 (`roadmap.md:24`). Manual fallback jest **guardrailem rdzenia**, nie osobnym produktem. |
| Wymagane tempo, projekcja, N miesięcy danych, on track / behind / ahead / open-ended | **Core** | Insight wizji: realistyczna prognoza rozstrzyga paraliż decyzyjny (`prd.md:20-22`, `prd.md:32`). |
| Parser AI jako **adapter** (Workers AI, JSON schema, fuzzy match nazw, rate-limit `ai_checkin_requests`) | **Supporting** (rdzenia) | Umożliwia core bet, ale sam model LLM nie jest wiedzą domenową. Non-Goals: „AI poza check-inem” (`prd.md:189`). Safety (FR-032–036) chroni rdzeń przed korupcją. |
| Wartość netto, aktywa, pasywa, kategorie aktywów, banner 3 miesiące | **Supporting** | Wizja: „nie jest rdzeniem produktu” (`prd.md:22`); Secondary Success Criterion (`prd.md:36`); nice-to-have w PRD kanonicznym (`prd.md:130`). |
| Profil, imię, DOB, wiek emerytalny, status związku → etykieta „Twoja/Wasza” | **Supporting** | Potrzebne do onboardingu (FR-002–004, FR-028), ale Non-Goals: brak trybu emerytalnego (`prd.md:194`); flaga związku nie steruje dostępem (`prd.md:184`). |
| Auth (magic link/OTP), sesja, RLS, middleware | **Generic** | Nie różnicuje produktu vs inne appki z Supabase. Guardrail Privacy jest **ograniczeniem**, nie USP. |
| Format PLN, i18n dat, layout, landing, język wizualny, confetti jako biblioteka | **Generic** | Prezentacja; celebracja *jako moment biznesowy* jest core, `canvas-confetti` jest generic. |
| Deploy Cloudflare, CI, Vitest | **Generic** | Poza domeną. |

---

## Krok 3 — Kandydaci na agregaty i niezmienniki

Kandydaci wynikają z granic spójności w dokumentach, nie z nazw klas w kodzie (tych klas nie ma).

### A. Cel oszczędnościowy (granica: jeden cel + jego wpłaty)

Encje wewnętrzne: wpłaty miesiąca, saldo startowe. Value objects: tempo, projekcja, plakietka statusu (wyliczane, niepersistowane).

| # | Niezmiennik (musi być zawsze prawdziwy) | Cytat źródłowy | Status w kodzie |
| --- | --- | --- | --- |
| A1 | `saved_amount` odzwierciedla rzeczywisty postęp (saldo startowe + wpłaty); korupcja niedopuszczalna | Guardrail Data integrity — `prd.md:41`; NFR — `prd.md:164` | **Deklaruje + częściowo egzekwuje w aplikacji.** `recalcSavedAmount` (`sync-saved-amount.ts:29-34`) po check-inie/edycji/usunięciu. **BRAK** constraintu SQL `saved_amount = opening + Σ payments`. Trigger ukończenia czyta **zdenormalizowane** `saved_amount` (`create_savings_goals.sql:37-40`), więc rozjazd denormalizacji psuje i postęp, i lifecycle. |
| A2 | Przy `saved_amount >= target_amount` i statusie `active` cel staje się `completed` (auto) | FR-009 — `prd.md:81` | **Egzekwuje w DB** trigger `check_savings_goal_completion` (`create_savings_goals.sql:32-49`). Aplikacja tylko odczytuje wynik (`check-in.ts:110-111`). |
| A3 | Cel jest porzucany (`abandoned`), nigdy niszczony | Non-Goals — `prd.md:198` | **Egzekwuje przez nieobecność** API delete celu; RLS celów **nie ma** policy DELETE (`create_savings_goals.sql:19-26` — SELECT/INSERT/UPDATE only). |
| A4 | Ukończonego / porzuconego nie przywraca się do `active` | FR-008 DROPPED — `prd.md:80` | **Egzekwuje przez nieobecność** restore; edycja/abandon/wpłaty odrzucają non-active (`goals/[id].ts:47-48`, `abandon.ts:40-41`, `payments/[paymentId].ts:43-44`). |
| A5 | Deadline opcjonalny; bez niego brak tempa i klasyfikacji | `prd.md:75`, `prd.md:174`, `prd.md:178` | **Częściowo.** Tempo `null` bez deadline (`projection.ts:127-128`); status `null` (`projection.ts:160-161`). **Projekcja daty liczy się mimo braku deadline** (`projection.ts:182-187`) i dashboard ją pokazuje (`dashboard.astro:212-218`) — wbrew FR-005. |
| A6 | Edycja target/deadline aktywnego celu jest dozwolona, ale koszt ma być widoczny | FR-006 — `prd.md:76-77` | **Deklaruje w UI.** Warning „może wpłynąć na śledzenie postępu” (`GoalForm.tsx:217-221`) — słabszy niż cytat PRD („this affects progress and projection”). |

### B. Check-in miesiąca (granica: jeden użytkownik × jeden miesiąc × wiele celów)

PRD traktuje **zapisany check-in** jako jednostkę integralności, mimo że nie ma takiej tabeli.

| # | Niezmiennik | Cytat źródłowy | Status w kodzie |
| --- | --- | --- | --- |
| B1 | Zapisany check-in nie gubi, nie duplikuje i nie przypisuje błędnie wpłaty | Guardrail — `prd.md:41`; US-01 AC — `prd.md:54` | **Ignoruje jako całość.** Zapis to pętla `upsert` per cel (`check-in.ts:82-96`) **bez transakcji**. Błąd w połowie zostawia częściowy check-in. Duplikat (cel×miesiąc) nie jest odrzucany — jest **nadpisywany** (`check-in.ts:83-90`, test `check-in.test.ts:202-219`). |
| B2 | Przyszły miesiąc zablokowany | FR-016 — `prd.md:99` | **Egzekwuje** `validateCheckInMonth` (`payment-validation.ts:71-72`) + test handlera (`check-in.test.ts:154-161`). |
| B3 | Wpłata AI nie trafia do bazy bez review i walidacji | FR-013 — `prd.md:93-94`; NFR — `prd.md:164` | **Egzekwuje ścieżką.** `/parse` zwraca JSON; zapis dopiero po review przez `/api/check-in`. |
| B4 | AI-propozycje: kwota dodatnia; nazwa = istniejący aktywny cel; niespełniające warunek **wyłączone z review**, nie wywalają całego parse | FR-035 — `prd.md:107` vs FR-036 — `prd.md:108` | **Rozjechane.** Nazwy: unmatched → `unrecognized`, nie review (`parse-checkin.ts:114-130`) — zgodne z FR-014. Kwota `≤ 0` w **dowolnym** elemencie zwala **cały** payload (`parse-schema.ts:7`, test `parse-schema.test.ts:22`) → 503 jak awaria AI. To egzekwuje FR-036 kosztem FR-035 (exclude, nie fail-closed całości). |
| B5 | Jawne 0 i pominięcie są różnymi aktami; oba = 0 w średniej projekcji | FR-015 — `prd.md:97-98`; `prd.md:176` | **Egzekwuje w zapisie i w średniej** (puste skip, `"0"` wiersz; luki w oknie = 0). **Historia wpłat nie materializuje pominiętych miesięcy** — tylko istniejące wiersze (`PaymentHistory.tsx:104-109`), więc FR-020 „including zero months” dotyczy wyłącznie **jawnych** zer. |
| B6 | Check-in tylko do celów `active` | US-01 Given — `prd.md:48` | **Egzekwuje** filtr `status = active` (`check-in.ts:73`, `parse.ts:55`). |

### C. Panel wartości netto (słaby agregat / wyliczenie)

Nie ma tabeli `net_worth`. To projekcja z kolekcji aktywów i pasywów użytkownika.

| # | Niezmiennik | Cytat | Status |
| --- | --- | --- | --- |
| C1 | Wartość netto = Σ aktywa − Σ pasywa; ujemna dozwolona | FR-025 Socrates — `prd.md:134-135` | **Egzekwuje** `computeNetWorth` (`compute.ts:5-8`) + test ujemnej (`compute.test.ts:8-10`) |
| C2 | Kategoria aktywa ∈ {cash, savings, investments, real_estate, other} | FR-023 — `prd.md:130` | **Egzekwuje** CHECK SQL + Zod-like parser (`validation.ts:6`, `36-43`) |
| C3 | Pasywa bez kategorii | Non-Goals — `prd.md:195` | **Egzekwuje przez nieobecność** kolumny |
| C4 | Jeden banner, gdy najstarsze aktywo > 3 mies.; dismissable | FR-027 — `prd.md:138-139` | **Egzekwuje** (`compute.ts:21-26`, `StaleAssetBanner.tsx:18-41`) |
| C5 | Potwierdzenie odświeża `last_updated_at` bez zmiany kwoty | FR-026 — `prd.md:136` | **Egzekwuje** (`confirm.ts:41-43`) |

### D. Tożsamość / izolacja (generic, ale twardy guardrail)

| # | Niezmiennik | Cytat | Status |
| --- | --- | --- | --- |
| D1 | Dane tylko właściciela | `prd.md:42` | **Egzekwuje** RLS + `eq("user_id", user.id)` w handlerach |
| D2 | Status związku nie zmienia uprawnień | `prd.md:184` | **Egzekwuje** — używany tylko w `getNetWorthHeadline` (`compute.ts:29-33`) |

---

## Krok 4 — Rozjazdy MODEL vs KOD

Najcenniejsza część: wiedza domenowa jest w dokumentach (albo odwrotnie: w kodzie bez języka).

| # | Dokument mówi X | Kod robi Y | Dowód |
| --- | --- | --- | --- |
| 1 | Check-in to spójna jednostka zapisu: „nigdy nie gubi, nie duplikuje i nie przypisuje błędnie wpłaty” (`prd.md:41`) | Check-in **nie jest encją**. Zapis = sekwencja upsertów bez transakcji; drugi check-in tego samego (cel×miesiąc) **cicho nadpisuje** kwotę | `check-in.ts:82-96`; `check-in.test.ts:202-219`; **BRAK** tabeli check-in |
| 2 | „Payments are atoms — delete + recreate” (`prd.md:126`) — sugeruje niezależne atomy, ewentualnie wiele na miesiąc | Model fizyczny: **co najwyżej jeden wiersz** na cel×miesiąc; check-in to replace, nie nowy atom | `create_goal_payments.sql:10`; plan S-03 wprost: „Multiple payment rows… NOT Doing” (`plan.md:36`) |
| 3 | Cele bez deadline: „show only total saved, **no projection/pace**” (`prd.md:75`) | Pace ukryte; **projekcja daty i tak liczona i renderowana**, gdy średnia > 0 | `projection.ts:182-187`; `dashboard.astro:212-218` |
| 4 | Status bez deadline = **„open-ended”** (`prd.md:178`) | Typ statusu nie zna `open-ended`; UI milczy (`null`) | `projection.ts:6`, `159-161`; `GoalStatusBadge.tsx:23-24` |
| 5 | FR-035: płatności z kwotą niedodatnią / złą nazwą **wykluczyć z review** (`prd.md:107`) | Zła nazwa → flaga (OK). Kwota `0` w JSON AI → **cały parse invalid** → 503 jak awaria modelu | `parse-schema.ts:7`; `parse-schema.test.ts:22`; `parse.ts:71-80` |
| 6 | FR-018/wizja: projekcja z historii wpłat; postęp = odłożone | Istnieje **`opening_saved_amount`**, którego PRD nie zna. Wchodzi do `saved_amount` (tempo, pasek), **nie** wchodzi do średniej miesięcznej | `sync-saved-amount.ts:29-30` vs `projection.ts:101-118`; **BRAK** w `prd.md` |
| 7 | FR-020: historia wpłat **w tym miesiące zerowe** (`prd.md:121`) | Historia = lista wierszy. Pominięty miesiąc (luka w projekcji = 0) **nie pojawia się** na liście | `PaymentHistory.tsx:104-109`; porównaj `projection.ts:112` (`?? 0`) |
| 8 | FR-001: logowanie **magic link** (`prd.md:63`) | Implementacja: **OTP** (`signInWithOtp`); README: „kod OTP (nie formularz hasła)” | `send-otp.ts:24`; `README.md:70` |
| 9 | FR-006 warning: „this affects progress **and projection**” (`prd.md:77`) | Soft copy: „może wpłynąć na śledzenie postępu” — bez słowa „projekcja” | `GoalForm.tsx:217-221` |
| 10 | NFR: odpowiedź AI nigdy nie jest zapisywana bez walidacji domenowej (`prd.md:164`) | Każde wywołanie parse **zapisuje** wiersz `ai_checkin_requests` **przed** wywołaniem modelu (nawet jeśli potem 503) | `parse.ts:65-71` vs `parse.ts:71`. To nie korupcja finansowa, ale dokument mówi „odpowiedź AI”; kod zapisuje **próbę**, nie odpowiedź. Język się rozjeżdża. |
| 11 | Ubiquitous language „check-in”, „open-ended”, „required pace”, „on track” | Kod miesza EN snake_case (`on_track`, `requiredPace`) z PL UI („Na dobrej drodze”, „Wymagane tempo”). Brak słownika w `src/` | `projection.ts:6-16`; `GoalStatusBadge.tsx:8-20` |
| 12 | Progi on track / behind / ahead — **otwarte pytanie** (`prd.md:204`) | Ciche default: porównanie **daty** projekcji z deadline (równość = on_track), nie odchylenie od tempa | `projection.ts:159-172`; plan S-03 przyznaje decyzję (`plan.md:17`, `45`) — **nie wróciła do PRD** |

Zgodności warte odnotowania (żeby ranking nie sugerował, że „nic nie działa”): auto-complete w triggerze; abandon bez hard-delete; review przed zapisem AI; manual fallback; future month blocked; RLS; kategorie aktywów; banner stale; celebracja; PLN w UI.

---

## Krok 5 — Ranking refaktoru

Skala: **wartość** = jak rdzeniowy jest niezmiennik względem Primary Success Criterion i guardrailu integralności. **Ryzyko** = jak słabo dziś jest egzekwowany (rozjazd, denormalizacja, brak granicy spójności).

| Rank | Kandydat | Wartość | Ryzyko dziś | Dlaczego tu |
| --- | --- | --- | --- | --- |
| **#1** | **Cel oszczędnościowy + komenda „zapisz check-in miesiąca”** | Najwyższa — to *jest* produkt | Najwyższe — denormalizacja `saved_amount` bez niezmiennika DB; check-in nieatomowy; ciche nadpisanie atomu; `opening_saved_amount` poza językiem | Patrz niżej |
| #2 | Value objects **projekcja / tempo / status** (w tym `open-ended`) | Wysoka — „czy plan jest realistyczny” | Średnie — matematyka jest w czystych funkcjach i przetestowana, ale **semantyka** (projekcja bez deadline, brak `open-ended`, progi dat vs tempo) rozjeżdża się z PRD | Po #1, bo VO powinny być liczone ze spójnego stanu celu |
| #3 | **Parser check-inu AI** jako anti-corruption (exclude vs fail-closed) | Wysoka jako *bet*, średnia jako model | Średnie — review i fallback działają; FR-035 vs FR-036 mylą operatora i usera (503 zamiast częściowego review) | Nie ruszać modelu LLM; doprecyzować politykę odrzucania pozycji |
| #4 | Panel wartości netto | Niska (supporting) | Niskie — kod blisko FR-023–027 | Nie refaktorować „żeby było DDD” |
| #5 | Profil / auth | Generic | Niskie domenowo (OTP vs magic link to produktowo-marketingowy dryf, nie korupcja finansowa) | Słownik + kopia, nie agregat |

### #1 do refaktoru i dlaczego

**Cel oszczędnościowy jako jedyna twarda granica spójności, z check-inem jako komendą domenową (nie tabelą CRUD).**

Dlatego #1, a nie „wydziel NetWorth” ani „owrapuj AI”:

1. Primary Success Criterion i guardrail Data integrity wskazują **ten** kawałek (`prd.md:32`, `prd.md:41`).
2. Dziś spójność postępu jest **procedurą** (`recalcSavedAmount` wołaną z trzech handlerów), nie niezmiennikiem. Trigger ukończenia ufa denormalizacji — to pojedynczy punkt, w którym rozjazd `saved_amount` vs Σ wpłat celebruje fałszywe „Saved!” albo go nie odpala.
3. Check-in — rdzeń doświadczenia — nie ma granicy: pętla upsert (`check-in.ts:82-96`) może zapisać cel A i paść na B; ponowny check-in **gubi** poprzednią kwotę zamiast duplikatu albo jawnego konfliktu. To wprost przeczy zdaniu guardrailu.
4. `opening_saved_amount` jest ukrytą decyzją domenową (saldo przed śledzeniem) bez nazwy w PRD — każdy kolejny feature projekcji będzie liczył „źle”, dopóki to nie wejdzie do języka.

Refaktor **nie** oznacza od razu nowej tabeli `check_ins`. Oznacza: jedna komenda „przypisz wpłaty miesiąca M do aktywnych celów”, atomowość, jawna polityka replace-vs-reject, niezmiennik `saved_amount`, i nazwanie salda startowego w języku wszechobecnym. Dopiero potem VO statusu (`open-ended`) i polityka FR-035.

---

## Metoda i ograniczenia

- Krok odkrycia: PRD, shape-notes, README, tech-stack, roadmap, plan S-03, migracje, `src/lib/goals`, `src/lib/net-worth`, handlery API, kluczowe UI.
- Nie zakładano nazw z zewnątrz; `opening_saved_amount` i unique `(goal_id, payment_month)` odkryto w kodzie/planie, nie w PRD.
- Warstwa `src/domain` nie istnieje — ocena egzekwowania dotyczy SQL + helperów + handlerów.
- Ten dokument nie zmienia kodu.
