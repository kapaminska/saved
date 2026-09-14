---
title: "Saved! — agregat-strażnik integralności postępu i check-inu"
created: 2026-09-14
type: refactor-plan
sources:
  - context/foundation/prd.md
  - context/foundation/shape-notes.md
  - context/foundation/tech-stack.md
  - context/foundation/roadmap.md
  - context/foundation/test-plan.md
  - context/domain/01-domain-distillation.md
  - README.md
  - context/archive/2026-06-23-manual-checkin-payments-projections/plan.md
limitation: null
---

# Plan: agregat-strażnik niezmiennika

Produkt mapy: **plan refaktoru, nie implementacja**. Kod produkcyjny nie został zmieniony. Nazwy bytów i wybór niezmiennika wynikają z dokumentów i kodu, nie z założonego szablonu DDD.

## Krok 0 — Kontekst

Dokumenty wymagań **istnieją**. Kanoniczne źródło domeny: `context/foundation/prd.md` (v1, draft, 2026-05-22). Uzupełnienia: `shape-notes.md`, `README.md`, `tech-stack.md`, `roadmap.md`, `test-plan.md`, destylacja `context/domain/01-domain-distillation.md`, zarchiwizowany plan S-03. Memory Bank (`memory-bank/`) **nie istnieje**. Rejestr kontraktów (`context/foundation/contract-surfaces.md`) **nie istnieje**.

**Wizja.** Użytkownik ma pieniądze do odłożenia, ale nie wie, jak je rozdzielić między cele ani czy plan jest realistyczny. Jedno zdanie NL raz w miesiącu ma zamienić się w wpłaty, postęp i prognozę. Panel wartości netto jest motywacyjnym kontekstem, **nie rdzeniem** (`prd.md:20-22`, `prd.md:32-36`).

**Primary Success Criterion:** definicja celu → miesięczny check-in (AI lub ręczny) → zaktualizowany postęp z projekcją i statusem (`prd.md:32`).

**Guardrail integralności:** „zapisany check-in nigdy nie gubi, nie duplikuje i nie przypisuje błędnie wpłaty. Zero tolerancji dla korupcji danych finansowych.” (`prd.md:41`).

**Stack i warstwy, w których żyje logika.**

| Warstwa | Gdzie | Rola dziś |
| --- | --- | --- |
| UI | `src/pages/*.astro`, `src/components/goals/` | Wyspy React: formularze check-inu, historii, celu. Część reguł (przyszły miesiąc, blokada `saved_amount`) jest tu zduplikowana. |
| API | `src/pages/api/{check-in,goals}/` | Orkiestracja: pętla `upsert`, `recalcSavedAmount`, abandon, CRUD wpłat. |
| Helpery | `src/lib/goals/` | Czyste funkcje (projekcja, parsery) + adaptery (AI, sync denormalizacji). **Brak** `src/domain/`. |
| Persystencja | `supabase/migrations/` | Tabele + RLS + trigger ukończenia. **Brak** transakcji aplikacyjnej / RPC. Klient Supabase z Workera nie otwiera multi-statement tx (`src/lib/supabase.ts` — wyłącznie SSR cookie client). |
| Auth | `src/middleware.ts`, RLS | Sesja + `PROTECTED_ROUTES`; izolacja `auth.uid() = user_id`. |

Wniosek: to **CRUD + procedury**, nie model z granicą spójności. Plan S-03 **deklarował** „recalc … on the same transaction's UPDATE” (`plan.md:51`), implementacja tego nie spełnia.

---

## Krok 1 — IDENTYFIKACJA niezmienników

Reguły, które w tej domenie **muszą** być zawsze prawdziwe. Źródło cytowane; ocena egzekwowania — krok 2.

### Rdzeń produktu (cele, check-in, postęp)

| ID | Niezmiennik | Źródło |
| --- | --- | --- |
| **I1** | Zapisany check-in jest całością: nie gubi, nie duplikuje i nie przypisuje błędnie wpłaty. Albo cała alokacja miesiąca (wpłaty **oraz** zsynchronizowany postęp celów) zostaje zapisana, albo stan sprzed komendy zostaje nietknięty. | Guardrail — `prd.md:41`; US-01 AC — `prd.md:54`; test-plan Risk #1/#2 — `test-plan.md:47-48` |
| **I2** | Postęp celu to tożsamość, nie luźne pole: `saved_amount = opening_saved_amount + Σ(goal_payments.amount)`. | Guardrail / NFR — `prd.md:41`, `prd.md:164`; S-03: SUM po każdej mutacji — `plan.md:51`; kod tożsamości — `sync-saved-amount.ts:29-34` |
| **I3** | Co najwyżej jedna wpłata na `(cel × miesiąc kalendarzowy)`. | S-03 „One row per goal per calendar month” / „Multiple payment rows … NOT Doing” — `plan.md:22`, `plan.md:36`; UNIQUE — `create_goal_payments.sql:10` |
| **I4** | Przy `status = active` i `saved_amount >= target_amount` cel przechodzi w `completed` (auto). | FR-009 — `prd.md:81`; trigger — `create_savings_goals.sql:37-44` |
| **I5** | Cel jest porzucany, nigdy niszczony. Przywracanie `abandoned`/`completed` → `active` jest poza MVP. | Non-Goals — `prd.md:198`; FR-007, FR-008 DROPPED — `prd.md:76-81` |
| **I6** | Mutacje wpłat i edycja celu dotyczą tylko statusu `active`. | US-01 Given — `prd.md:48`; handlery 409 |
| **I7** | Miesiąc check-inu / wpłaty nie może być w przyszłości; przeszłość dozwolona. | FR-016 — `prd.md:99` |
| **I8** | Jawne 0 i pominięcie (puste pole) to różne akty; oba liczą się jako 0 w średniej projekcji. Puste ≠ wiersz. | FR-015 — `prd.md:97-98`; Business Logic pkt 3 — `prd.md:176` |
| **I9** | Wpłata AI nie trafia do bazy bez review. Parse nie jest zapisem finansowym. | FR-013 — `prd.md:93-94`; NFR — `prd.md:164` |
| **I10** | Propozycje AI: kwota dodatnia i nazwa = istniejący aktywny cel; niespełniające warunek **wyłączone z review**, nie korumpują zapisu. | FR-035 — `prd.md:107`; FR-014 — `prd.md:95-96` |
| **I11** | Malformowana odpowiedź AI = niedostępność (fallback ręczny), nigdy zapis finansowy. | FR-036 — `prd.md:108`; NFR — `prd.md:164` |
| **I12** | Deadline opcjonalny: bez niego brak wymaganego tempa i klasyfikacji on track/behind/ahead (tylko „open-ended”); FR-005: bez projekcji/tempa. | FR-005 — `prd.md:75`; Business Logic pkt 2 i 4 — `prd.md:174`, `prd.md:178` |
| **I13** | Projekcja = średnia miesięczna z historii (luki i zera = 0), etykieta „N miesięcy danych”. Tempo = `(target − saved) / miesiące do deadline`. | FR-017–018 — `prd.md:112-115`; `prd.md:176` |

### Supporting / generic

| ID | Niezmiennik | Źródło |
| --- | --- | --- |
| **I14** | Wartość netto = Σ aktywa − Σ pasywa; ujemna dozwolona. | FR-025 — `prd.md:134` |
| **I15** | Kategoria aktywa ∈ zamkniętej liście; pasywa bez kategorii. | FR-023–024, Non-Goals — `prd.md:130-132`, `prd.md:195-196` |
| **I16** | Banner nieaktualności gdy najstarsze aktywo > 3 mies.; dismissable. Confirm odświeża datę bez zmiany kwoty. | FR-026–027 — `prd.md:136-139` |
| **I17** | User A nigdy nie widzi / nie mutuje danych user B. | Guardrail Privacy — `prd.md:42`; NFR — `prd.md:161` |
| **I18** | Status związku zmienia tylko etykietę „Twoja/Wasza”, nie uprawnienia. | Access Control — `prd.md:184` |
| **I19** | Tekst AI ≤ 500 znaków; pusty odrzucony przed modelem; rate-limit z fallbackiem ręcznym. | FR-032–034 — `prd.md:104-106` |
| **I20** | Tylko PLN. | Non-Goals — `prd.md:188` |

Pojęcie **`opening_saved_amount`** (saldo startowe, nie będące wierszem wpłaty) **nie występuje w PRD**. Pojawia się w migracji `20260623150000_add_opening_saved_amount.sql:1-3` i w recalku. To ukryta decyzja domenowa: postęp = saldo sprzed śledzenia + atomy wpłat.

---

## Krok 2 — KLASYFIKACJA i wybór #1

Osie: **(a)** rdzeniowość względem wizji / Primary SC / guardrailu; **(b)** rozsmarowanie (ile warstw/plików); **(c)** egzekwowanie: egzekwowany / deklarowany / naruszalny.

| ID | (a) Rdzeń | (b) Rozsmarowanie | (c) Egzekwowanie | Werdykt |
| --- | --- | --- | --- | --- |
| **I1** | Najwyższy — *jest* guardrailem produktu i pętlą US-01 | API + 3 UI + UNIQUE + testy, które **kodyfikują overwrite**; brak encji check-in | **Naruszalny.** Brak transakcji; błąd w połowie zostawia wpłaty bez recalku; drugi check-in cicho nadpisuje | Kandydat #1 |
| **I2** | Najwyższy — postęp, pasek, celebracja i tempo czytają `saved_amount` | Helper + 4 handlery + trigger ukończenia + GoalForm + projekcja SSR | **Deklarowany + proceduralny.** `recalcSavedAmount` po *niektórych* ścieżkach; brak constraintu SQL; drift psuje I4 | Kandydat #1 (ta sama granica) |
| **I3** | Wysoki (atom wpłaty) | UNIQUE w DB + upsert w API + 409 przy edycji kolizji miesiąca | **Egzekwowany fizycznie** (jeden wiersz). Semantyka replace-vs-reject **niespójna** (check-in replace, edit reject) | Współwinny I1 |
| **I4** | Wysoki (moment „Saved!”) | Trigger DB; aplikacja tylko odczytuje status | **Egzekwowany w DB**, ale na zdenormalizowanym polu — dziedziczy słabość I2 | Zależny od I2 |
| **I5** | Średni (cykl życia) | Brak DELETE policy + brak endpointu delete/restore | **Egzekwowany przez nieobecność** | OK na MVP |
| **I6** | Wysoki | Check-in, edit, abandon, payment edit/delete | **Egzekwowany** (409) | OK |
| **I7** | Wysoki | Parser + check-in + payment edit; UI `max` tylko na części formularzy | **Egzekwowany na serwerze**; UI niespójne (historia wpłat bez `max`) | Słabszy od I1 |
| **I8** | Wysoki | UI + handler + projekcja; historia **nie** materializuje luk | **Częściowo.** Zapis i średnia OK; FR-020 „including zero months” tylko dla *jawnych* zer | Semantyka historii, nie korupcja zapisu |
| **I9** | Wysoki (core bet) | `/parse` vs `/api/check-in`; UI review | **Egzekwowany ścieżką** | OK |
| **I10** | Wysoki jako *bet*, średni jako model | Zod schema vs matcher nazw vs UI | **Rozjechane.** Zła nazwa → exclude (OK). Kwota `≤ 0` w JSON → cały parse 503 | Supporting adapter |
| **I11** | Wysoki (anti-corruption) | parse-checkin + parse.ts | **Egzekwowany** | OK |
| **I12** | Wysoki (realizm planu) | projection.ts + dashboard + badge | **Częściowo / rozjazd z PRD.** Tempo `null` bez deadline; **projekcja daty i tak liczona** | Semantyka VO, nie korupcja finansowa |
| **I13** | Wysoki | Czyste funkcje + testy | **Egzekwowany w lib**; czyta I2 | Po I1/I2 |
| **I14–I16** | Niski (supporting, `prd.md:22`) | `src/lib/net-worth` + API | **Egzekwowany** | Nie ruszać „żeby było DDD” |
| **I17** | Twardy guardrail, generic | RLS + `eq("user_id")` + middleware | **Egzekwowany** (RLS poza `npm test`) | Osobny tor (test-plan Risk #3) |
| **I18–I20** | Generic / supporting | Pojedyncze miejsca | **Egzekwowany** albo niejawny | Poza zakresem |

### Wybór #1

**Niezmiennik strzeżony: integralność zapisanego check-inu **oraz** tożsamość postępu celu (I1 ∧ I2, z I3/I4 jako konsekwencje).**

W jednym zdaniu domenowym:

> Dla każdego celu oszczędnościowego postęp jest tożsamością `saldoStartowe + unikalne wpłaty miesięczne`. Komenda „zapisz check-in miesiąca M” stosuje alokacje do aktywnych celów **atomowo**: wszystkie zgłoszone wpłaty i zsynchronizowany postęp (w tym ewentualne `active → completed`) albo zostają zapisane razem, albo nic nie zostaje zapisane. Nielegalna operacja rzuca nazwany błąd — nie loguje-i-jedzie, nie zostawia połowy miesiąca, nie synchronizuje postępu „kiedy się uda”.

**Dlaczego ten, a nie I12 (open-ended) ani I10 (FR-035):**

1. Primary SC i guardrail wskazują **ten** kawałek (`prd.md:32`, `prd.md:41`). North star S-04 to check-in → zaktualizowany postęp (`roadmap.md:24`). Test-plan stawia assignment i payment integrity jako Risk #1 i #2 (`test-plan.md:47-48`).
2. I1 jest **najsłabiej** egzekwowany: check-in nie jest encją, zapis to pętla `upsert` bez transakcji (`check-in.ts:82-96`), recalk jest **osobną** pętlą (`check-in.ts:99-113`). S-03 *chciało* tej samej transakcji (`plan.md:51`) — kod tego nie zrobił.
3. I2 jest **procedurą** wołaną z czterech handlerów, nie niezmiennikiem. Trigger I4 ufa denormalizacji — rozjazd celebruje fałszywe „Saved!” albo go nie odpala.
4. I12 jest rozjazdem semantyki (projekcja bez deadline), ale matematyka **jest** w czystych, przetestowanych funkcjach. I10 myli operatora (503 zamiast exclude), ale **nie zapisuje** śmieci do `goal_payments` (`parse.ts:83-88` zwraca JSON; zapis idzie inną ścieżką). Korupcja finansowa jest w I1/I2, nie w parserze.
5. Wartość netto (I14) jest supporting by design (`prd.md:22`) i dobrze domknięta.

Agregat-strażnik (krok 4) to **cel oszczędnościowy** (granica: jeden cel + jego wpłaty). Check-in **nie** dostaje własnej tabeli w tym planie — jest komendą aplikacyjną, która w **jednej** transakcji zapisuje N korzeni. To zachowuje małą granicę spójności i jednocześnie zamyka I1.

---

## Krok 3 — DIAGNOZA wybranego niezmiennika

### 3.1 Gdzie dziś żyje reguła (zweryfikowane cytaty)

#### Persystencja — denormalizacja bez tożsamości

```7:7:supabase/migrations/20260623120000_create_savings_goals.sql
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
```

CHECK pilnuje `>= 0`, **nie** równości z sumą wpłat. Kolumna jest zdenormalizowana.

```32:49:supabase/migrations/20260623120000_create_savings_goals.sql
create or replace function public.check_savings_goal_completion()
returns trigger
...
  if new.status = 'active'
    and new.saved_amount >= new.target_amount then
    new.status := 'completed';
    new.completed_at := now();
  end if;
...
create trigger savings_goals_check_completion
  before insert or update of saved_amount, target_amount, status on public.savings_goals
```

Ukończenie czyta **zdenormalizowane** `saved_amount`. Drift I2 psuje I4.

```10:10:supabase/migrations/20260623140000_create_goal_payments.sql
  unique (goal_id, payment_month)
```

Fizyczna unikalność I3. Nie ma triggera na `goal_payments`, który by przeliczał `saved_amount`.

```1:3:supabase/migrations/20260623150000_add_opening_saved_amount.sql
ALTER TABLE public.savings_goals
  ADD COLUMN opening_saved_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
  CHECK (opening_saved_amount >= 0);
```

Saldo startowe istnieje tylko w schemacie.

RLS celów: SELECT/INSERT/UPDATE, **brak** DELETE (`create_savings_goals.sql:19-26`) — I5 przez nieobecność. Wpłaty **mają** DELETE (`create_goal_payments.sql:27-28`).

**Warstwa persystencji nie egzekwuje I1 ani I2.** Nie ma funkcji RPC, nie ma `BEGIN` w ścieżce aplikacji (jedyne `begin;` w repo to skrypty testów RLS / seed).

#### Helper — procedura recalku (nie niezmiennik)

```29:37:src/lib/goals/sync-saved-amount.ts
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const total = goal.opening_saved_amount + paymentTotal;

  const { data, error } = await supabase
    .from("savings_goals")
    .update({ saved_amount: total })
    .eq("id", goalId)
```

Osobne round-tripy: SELECT celu → SELECT wpłat → UPDATE celu. Każdy auto-commit. Błąd UPDATE zostawia wpłaty zapisane, postęp stary. Komunikaty `"Failed to load goal"` / `"Failed to sum payments"` / `"Failed to update saved amount"` (`sync-saved-amount.ts:17`, `26`, `40`) — handler zwraca je jako 500 **po** udanych upsertach.

#### API check-in — pętla bez transakcji, ciche nadpisanie, recalk po fakcie

```82:113:src/pages/api/check-in.ts
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

    if (upsertError) {
      return jsonResponse({ success: false, error: "Nie udało się zapisać wpłaty" }, 500);
    }
  }
  ...
  for (const goalId of uniqueGoalIds) {
    ...
    const recalc = await recalcSavedAmount(supabase, goalId);
    if (!recalc.ok) {
      return jsonResponse({ success: false, error: recalc.error }, 500);
    }
```

Fail-fast **deklarowany** (return 500), ale **nie cofa** poprzednich `upsert`. Scenariusz: cel A zapisany, cel B pada → klient widzi błąd, A ma nową wpłatę, `saved_amount` A **nie** przeliczony (druga pętla się nie zaczęła). To jest I1 złamane + I2 złamane jednocześnie.

Test **kodyfikuje overwrite** jako sukces, nie jako konflikt:

```202:219:src/pages/api/check-in.test.ts
  it("overwrites the same goal+month via upsert onConflict instead of inserting a second row", async () => {
    ...
    expect(upserts[0]?.args[0]).toMatchObject({ amount: 100 });
    expect(upserts[1]?.args[0]).toMatchObject({ amount: 250 });
```

Test 500 przy upsert (`check-in.test.ts:122-128`) nie obejmuje *częściowego* multi-goal.

Filtr aktywnych celów jest na serwerze (`check-in.ts:69-77`) — I6 dla check-inu **jest** egzekwowane. I7 też (`check-in.ts:27-29` + `payment-validation.ts:71-72`).

Puste pole pomijane, `"0"` zapisywane (`check-in.ts:48-50`) — I8 w zapisie OK.

#### API wpłat — recalk po mutacji, inna polityka konfliktu miesiąca

Edycja: kolizja miesiąca → **409**, nie upsert (`payments/[paymentId].ts:70-80`, `84-101`). Usunięcie: delete, potem recalk (`delete.ts:58-72`). Oba **nie** są w jednej transakcji z recalkiem: delete/update commituje się przed `recalcSavedAmount`. I6 egzekwowane (`payments/[paymentId].ts:43-44`, `delete.ts:42-44`).

Niespójność I3: check-in **replace**, edycja miesiąca **reject**.

#### API celu — bezpośredni zapis `saved_amount` (omija recalk)

Tworzenie ustawia oba pola na tę samą kwotę, bez wierszy wpłat (`goals/index.ts:56-57`) — legalny stan początkowy I2 (`opening + 0`).

Edycja: `saved_amount` / `opening` ruszane **tylko** gdy `paymentCount === 0` (`goals/[id].ts:93-96`). Test to potwierdza (`goals/[id].test.ts:75-92`). I2 przy edycji **jest** strzeżone po stronie serwera, o ile nikt nie wstawi wpłaty inną drogą między `count` a `update` (wyścig).

Abandon: czysty UPDATE statusu (`abandon.ts:44-48`) — nie rusza postępu.

#### UI — strażnik UX, nie integralności; połykanie drugiej celebracji

Check-in ręczny i AI idą na **ten sam** POST `/api/check-in` (`CheckInModal.tsx:68-71`, `AiCheckInTab.tsx:157-161`, `GoalQuickPayment.tsx:44-48`). Klient składa `goal_id` + `amount`; serwer **ufa UUID** z formularza (nie re-matchuje nazw — test `check-in.test.ts:256-265`). To jest poprawne po review, ale UI jest jedynym miejscem, które *decyduje*, które cele weszły do batcha. Pusty batch łapie klient (`CheckInModal.tsx:61-64`, `AiCheckInTab.tsx:150-153`) **oraz** serwer (`check-in.ts:64-65`) — tu UI nie jest jedynym strażnikiem.

Przyszły miesiąc: `ManualCheckInForm.tsx:58` i `GoalQuickPayment.tsx:125` mają `max={defaultMonth}`. **`PaymentHistory` nie ma `max`** na inpucie miesiąca (`PaymentHistory.tsx:131-141`) — jedyny strażnik I7 przy edycji historii to serwer.

Blokada edycji „już odłożono” gdy są wpłaty: UI (`GoalForm.tsx:79-93`, `184-189`) **i** serwer (`goals/[id].ts:93-96`). UI nie jest jedynym strażnikiem.

**Połykanie, nie fail-fast (UX check-inu jako całości):** przy wielu ukończonych celach w jednym zapisie UI bierze tylko `[0]`:

```173:176:src/components/goals/AiCheckInTab.tsx
      const completed = json.completedGoals?.[0];
      if (completed) {
        window.location.href = `/dashboard?celebrated=${completed.id}`;
```

To samo: `CheckInModal.tsx:84-86`, `GoalQuickPayment.tsx:60-62`. Handler zbiera *wszystkie* `completedGoals` (`check-in.ts:98-111`), klient **wyrzuca resztę**. Drugie „Saved!” nie istnieje.

#### Odczyt / projekcja — ufa denormalizacji

```181:188:src/lib/goals/projection.ts
  const requiredPaceValue = requiredPace(goal.target_amount, goal.saved_amount, goal.deadline, asOfDate);
  const projectedCompletionDateValue = projectedCompletionDate(
    goal.saved_amount,
    ...
```

Dashboard renderuje `goal.saved_amount` (`dashboard.astro:202`). Średnia idzie z wierszy wpłat (`projection.ts:101-118`), pasek z denormalizacji — przy drifcie I2 pasek i tempo kłamią, średnia może być „prawdziwsza”.

Projekcja daty **liczy się bez deadline** (`projection.ts:182-187`) i dashboard ją pokazuje (`dashboard.astro:212-218`) wbrew FR-005 / I12 — to **osobny** rozjazd, nie strażnik I1.

#### Parse AI — poza zapisem finansowym (dla kontrastu)

`/api/check-in/parse` zwraca JSON propozycji (`parse.ts:83-88`). Matcher wrzuca unmatched do `unrecognized`, nie do review (`parse-checkin.ts:114-130`). Zod `amount.gt(0)` zwala **cały** payload (`parse-schema.ts:7`) → 503 (`parse.ts:71-80`). To I10/I11, nie I1 — parse **nie** wstawia `goal_payments`.

### 3.2 Mapa luk

| Luka | Warstwa | Objaw |
| --- | --- | --- |
| Brak granicy spójności check-inu | API | Pętla upsert; częściowy zapis przy 500 |
| Recalk poza transakcją | API + helper | Wpłata commituje się przed UPDATE `saved_amount`; pad recalku = drift I2 |
| Brak constraintu tożsamości postępu | DB | Studio / przyszły handler / wyścig mogą rozjechać pasek i celebrację |
| Ciche replace w check-inie vs 409 w edycji | API | Ta sama para (cel×miesiąc), dwie polityki |
| Trigger ukończenia na denormalizacji | DB | Fałszywe lub pominięte „Saved!” |
| UI połyka N−1 celebracji | UI | Check-in jako całość nie ma momentu brandowego per ukończony cel |
| Historia bez `max` miesiąca | UI | I7 tylko na serwerze na tej ścieżce (OK jako obrona, zła jako spójność UX) |
| Klient układa batch | UI | Serwer waliduje active UUID, nie intencję „cały miesiąc vs podzbiór” — to legalne, ale nie ma komendy domenowej |
| Testy utrwalają overwrite i 500-po-upsert | Testy | Brak testu „multi-goal: drugi upsert pada → pierwszy niewidoczny” — bo dziś to **nie** jest prawda |

Warstwy, które **nie** egzekwują I1/I2: domena (nie istnieje), persystencja (brak tx / brak tożsamości), UI (nie może — i nie powinno). Jedyny „strażnik” to dyscyplina handlerów + nadzieja, że `recalc` zostanie wywołane.

---

## Krok 4 — PROJEKT agregatu-strażnika

### 4.1 Granica i root

**Root: `SavingsGoal` (cel oszczędnościowy).** Encje wewnętrzne: `MonthlyPayment` (atom: miesiąc + kwota ≥ 0). Value object: `OpeningBalance` (saldo startowe; nazwa z kodu, nie z PRD — wciągnąć do języka). Value objects liczone, niepersistowane: tempo, projekcja, status (poza zakresem tego refaktoru poza tym, że czytają spójny postęp).

**Nie** tworzymy tabeli `check_ins`. Check-in to komenda `RecordMonthlyCheckIn` na zbiorze korzeni, zapisana w jednej transakcji. Uzasadnienie: wpłaty i ukończenie są per cel (FK, UNIQUE, trigger I4); szeroki agregat „portfel użytkownika” spiąłby wartość netto i cele bez potrzeby.

Jedyny writer mutujący wpłaty i `saved_amount`: metody korzenia + `save` / `saveAll` repozytorium. Handlery przestają wołać `from("goal_payments").upsert` i `recalcSavedAmount`.

### 4.2 Tożsamość postępu (niezmiennik korzenia)

Po każdej mutacji, **zanim** agregat uzna operację za zakończoną:

```
assert progress === openingBalance + sum(payments[].amount)
assert unique (payment.month) w kolekcji
assert każdy payment.amount >= 0
assert payment.month nie jest w przyszłości (względem `asOf`)
jeśli status == active && progress >= target → status = completed, completedAt = now
status ∈ {active, completed, abandoned}
```

Naruszona asercja = bug w metodzie domenowej albo drift przy load — **rzuca**, nie „naprawia po cichu i jedzie”. Przy load: jeśli wiersze z DB już łamią tożsamość, `SavingsGoal.rehydrate` rzuca `ProgressDriftDetected` (fail-fast na odczycie do zapisu; ekrany SSR mogą liczyć postęp z wpłat i logować alert operatorski — ale **zapis** nie kontynuuje na zepsutym stanie).

### 4.3 Błędy domenowe (nazwane, fail-fast)

```ts
export class DomainError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class GoalNotActive extends DomainError {
  constructor() { super("GOAL_NOT_ACTIVE", "Tylko aktywne cele przyjmują tę operację"); }
}
export class FutureMonthForbidden extends DomainError {
  constructor() { super("FUTURE_MONTH", "Miesiąc nie może być w przyszłości"); }
}
export class PaymentMonthConflict extends DomainError {
  constructor() { super("PAYMENT_MONTH_CONFLICT", "Wpłata na ten miesiąc już istnieje"); }
}
export class EmptyCheckIn extends DomainError {
  constructor() { super("EMPTY_CHECK_IN", "Brak wpłat do zapisania"); }
}
export class CheckInGoalMissing extends DomainError {
  constructor() { super("CHECK_IN_GOAL_MISSING", "Nie znaleziono co najmniej jednego aktywnego celu"); }
}
export class DuplicateGoalInCheckIn extends DomainError {
  constructor() { super("DUPLICATE_GOAL_IN_CHECK_IN", "Ten sam cel występuje więcej niż raz w check-inie"); }
}
export class ProgressDriftDetected extends DomainError {
  constructor() { super("PROGRESS_DRIFT", "Postęp celu nie zgadza się z wpłatami"); }
}
export class GoalNotAbandonable extends DomainError {
  constructor() { super("GOAL_NOT_ABANDONABLE", "Tylko aktywne cele można porzucić"); }
}
```

Żadna metoda nie łapie tych błędów, żeby „zaktualizować co się da”.

### 4.4 Sygnatury + pseudokod

```ts
type GoalStatus = "active" | "completed" | "abandoned";
type CalendarMonth = string; // 'YYYY-MM-01'
type Money = number;         // PLN, 2 dp — parser na granicy API

class MonthlyPayment {
  constructor(
    readonly id: string,
    readonly month: CalendarMonth,
    readonly amount: Money,
  ) {}
}

class SavingsGoal {
  private constructor(
    readonly id: string,
    readonly userId: string,
    private name: string,
    private target: Money,
    private opening: Money,
    private deadline: CalendarMonth | null,
    private status: GoalStatus,
    private completedAt: Date | null,
    private payments: MonthlyPayment[],
    readonly createdAt: Date,
  ) {
    this.assertProgressIdentity();
  }

  static create(input: {
    userId: string;
    name: string;
    target: Money;
    opening: Money; // saldo startowe; 0 jeśli start od zera
    deadline: CalendarMonth | null;
  }): SavingsGoal { /* status=active, payments=[], saved=opening */ }

  static rehydrate(row: GoalSnapshot): SavingsGoal {
    const goal = new SavingsGoal(...);
    // jeśli row.saved_amount !== goal.progress() → throw ProgressDriftDetected
    return goal;
  }

  progress(): Money {
    return this.opening + this.payments.reduce((s, p) => s + p.amount, 0);
  }

  /** Check-in i „szybka wpłata”: jawna korekta miesiąca (replace). */
  recordPaymentForMonth(month: CalendarMonth, amount: Money, asOf: Date): void {
    this.requireActive();
    this.requireNotFuture(month, asOf);
    this.requireAmount(amount);
    const existing = this.payments.find((p) => p.month === month);
    if (existing) {
      this.payments = this.payments.map((p) =>
        p.month === month ? new MonthlyPayment(p.id, month, amount) : p,
      );
    } else {
      this.payments.push(new MonthlyPayment(crypto.randomUUID(), month, amount));
    }
    this.applyCompletion();
    this.assertProgressIdentity();
  }

  /** FR-021: zmiana atomu. Kolizja miesiąca = błąd, nie merge. */
  changePayment(paymentId: string, month: CalendarMonth, amount: Money, asOf: Date): void {
    this.requireActive();
    this.requireNotFuture(month, asOf);
    this.requireAmount(amount);
    const current = this.requirePayment(paymentId);
    const occupant = this.payments.find((p) => p.month === month && p.id !== paymentId);
    if (occupant) throw new PaymentMonthConflict();
    this.payments = this.payments.map((p) =>
      p.id === paymentId ? new MonthlyPayment(p.id, month, amount) : p,
    );
    this.applyCompletion();
    this.assertProgressIdentity();
  }

  /** FR-022: atom usunięty. */
  removePayment(paymentId: string): void {
    this.requireActive();
    this.requirePayment(paymentId);
    this.payments = this.payments.filter((p) => p.id !== paymentId);
    this.assertProgressIdentity();
    // completed nie wraca do active (FR-008 dropped) — nawet jeśli progress spadnie poniżej target
  }

  renameAndRetarget(name: string, target: Money, deadline: CalendarMonth | null): void {
    this.requireActive();
    this.name = name;
    this.target = target;
    this.deadline = deadline;
    this.applyCompletion(); // podniesienie targetu nie „od-kończy”; obniżenie może dokończyć
    this.assertProgressIdentity();
  }

  /** Dozwolone tylko gdy payments.length === 0. */
  setOpeningBalance(amount: Money): void {
    this.requireActive();
    if (this.payments.length > 0) {
      throw new DomainError("OPENING_LOCKED", "Saldo startowe jest zamknięte po pierwszej wpłacie");
    }
    this.opening = amount;
    this.applyCompletion();
    this.assertProgressIdentity();
  }

  abandon(): void {
    if (this.status !== "active") throw new GoalNotAbandonable();
    this.status = "abandoned";
  }

  snapshot(): GoalSnapshot { /* id, fields, payments, progress, status */ }

  private applyCompletion(): void {
    if (this.status === "active" && this.progress() >= this.target) {
      this.status = "completed";
      this.completedAt = new Date();
    }
  }

  private assertProgressIdentity(): void {
    const months = this.payments.map((p) => p.month);
    if (new Set(months).size !== months.length) {
      throw new DomainError("DUPLICATE_MONTH", "Wewnętrzny duplikat miesiąca");
    }
    // progress() jest źródłem prawdy; persist zapisuje saved_amount = progress()
  }

  private requireActive(): void {
    if (this.status !== "active") throw new GoalNotActive();
  }
}
```

Komenda check-inu (serwis aplikacyjny, nie root):

```ts
class RecordMonthlyCheckIn {
  constructor(private readonly goals: SavingsGoalRepository) {}

  async execute(input: {
    userId: string;
    month: CalendarMonth;
    allocations: { goalId: string; amount: Money }[];
    asOf: Date;
  }): Promise<{ completed: { id: string; name: string }[] }> {
    if (input.allocations.length === 0) throw new EmptyCheckIn();
    const ids = input.allocations.map((a) => a.goalId);
    if (new Set(ids).size !== ids.length) throw new DuplicateGoalInCheckIn();

    const aggregates = await this.goals.loadManyForUpdate(ids, input.userId);
    if (aggregates.length !== ids.length) throw new CheckInGoalMissing();

    for (const line of input.allocations) {
      const goal = aggregates.find((g) => g.id === line.goalId)!;
      goal.recordPaymentForMonth(input.month, line.amount, input.asOf);
    }

    await this.goals.saveAll(aggregates); // JEDNA transakcja

    return {
      completed: aggregates
        .filter((g) => g.snapshot().status === "completed")
        .map((g) => ({ id: g.id, name: g.snapshot().name })),
    };
  }
}
```

Polityka replace w `recordPaymentForMonth` jest **jawna** (korekta miesiąca — FR-016: ludzie zapominają i wracają). To nie jest już przypadkowy `onConflict` w handlerze. Edycja historii nadal **odrzuca** kolizję — dwie intencje, dwa kody błędów, jeden korzeń.

### 4.5 Repozytorium i jedna transakcja

Klient `supabase-js` na Cloudflare Workers **nie** eksponuje `BEGIN/COMMIT` dla wielu `.from()`. Jedyna atomowość to **funkcja Postgres** (ciało funkcji = jedna transakcja) wołana przez `supabase.rpc`.

```ts
interface SavingsGoalRepository {
  load(id: string, userId: string): Promise<SavingsGoal | null>;
  loadManyForUpdate(ids: string[], userId: string): Promise<SavingsGoal[]>;
  save(goal: SavingsGoal): Promise<void>;       // rpc, 1 cel
  saveAll(goals: SavingsGoal[]): Promise<void>; // rpc, N celów
}
```

Szkic RPC (persistuje **snapshot z agregatu**, nie „dopisuje po kawałku”):

```sql
create or replace function public.save_savings_goals(payload jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  goal jsonb;
  payment jsonb;
  expected numeric;
begin
  for goal in select * from jsonb_array_elements(payload -> 'goals')
  loop
    perform 1 from public.savings_goals
      where id = (goal->>'id')::uuid and user_id = auth.uid()
      for update;
    if not found then
      raise exception 'goal_not_found';
    end if;

    -- zastąp zbiór wpłat tego celu zestawem z snapshotu
    delete from public.goal_payments
      where goal_id = (goal->>'id')::uuid
        and user_id = auth.uid();

    for payment in select * from jsonb_array_elements(goal -> 'payments')
    loop
      insert into public.goal_payments (id, goal_id, user_id, amount, payment_month)
      values (
        (payment->>'id')::uuid,
        (goal->>'id')::uuid,
        auth.uid(),
        (payment->>'amount')::numeric,
        (payment->>'month')::date
      );
    end loop;

    expected := (goal->>'opening')::numeric
      + coalesce((
          select sum(amount) from public.goal_payments
          where goal_id = (goal->>'id')::uuid
        ), 0);

    if expected <> (goal->>'progress')::numeric then
      raise exception 'progress_drift'; -- fail-fast, rollback całej funkcji
    end if;

    update public.savings_goals set
      name = goal->>'name',
      target_amount = (goal->>'target')::numeric,
      opening_saved_amount = (goal->>'opening')::numeric,
      saved_amount = expected,
      deadline = nullif(goal->>'deadline','')::date,
      status = goal->>'status',
      completed_at = nullif(goal->>'completedAt','')::timestamptz
    where id = (goal->>'id')::uuid
      and user_id = auth.uid();
  end loop;
end;
$$;
```

`saveAll` check-inu wysyła **wszystkie** ruszane cele w jednym `payload`. Pad na celu B cofa cel A. Trigger I4 może zostać: dostanie spójne `saved_amount` w tym samym UPDATE; albo ukończenie zostaje wyłącznie w agregacie, a trigger staje się asercją `status` zgodnego z progami — decyzja fazy migracji (krok 5). **Nie** dodajemy cichego triggera „popraw `saved_amount`”, bo to znów loguj-i-jedź.

Istniejący UNIQUE `(goal_id, payment_month)` zostaje jako siatka bezpieczeństwa I3.

### 4.6 Cienkie API

Wzorzec każdego mutującego route:

1. Auth (jak dziś: `locals.user` → 401).
2. Parse wejścia (form → DTO); błąd parsera → 400.
3. Wywołaj metodę agregatu / `RecordMonthlyCheckIn.execute`.
4. Mapuj `DomainError.code` → HTTP. Nie łap w celu kontynuacji.

```ts
// src/pages/api/check-in.ts (docelowo)
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return jsonResponse({ success: false, error: "Brak autoryzacji", code: "UNAUTHORIZED" }, 401);

  const form = await context.request.formData();
  const parsed = parseCheckInForm(form); // month + allocations
  if (!parsed.ok) return jsonResponse({ success: false, error: parsed.error, code: parsed.code }, 400);

  try {
    const result = await new RecordMonthlyCheckIn(repo(context)).execute({
      userId: user.id,
      month: parsed.month,
      allocations: parsed.allocations,
      asOf: new Date(),
    });
    return jsonResponse({ success: true, completedGoals: result.completed });
  } catch (e) {
    return mapDomainError(e);
  }
};

function mapDomainError(e: unknown): Response {
  if (e instanceof EmptyCheckIn) return json(..., 400);
  if (e instanceof FutureMonthForbidden) return json(..., 400);
  if (e instanceof DuplicateGoalInCheckIn) return json(..., 400);
  if (e instanceof CheckInGoalMissing) return json(..., 404);
  if (e instanceof GoalNotActive) return json(..., 409);
  if (e instanceof PaymentMonthConflict) return json(..., 409);
  if (e instanceof ProgressDriftDetected) return json(..., 500);
  return json({ success: false, error: "Nie udało się zapisać" }, 500);
}
```

To samo dla:

| Route dziś | Po |
| --- | --- |
| `POST /api/check-in` | `RecordMonthlyCheckIn` |
| `POST /api/goals/[id]/payments/[paymentId]` | `load` → `changePayment` → `save` |
| `POST /api/goals/[id]/payments/[paymentId]/delete` | `load` → `removePayment` → `save` |
| `POST /api/goals` | `SavingsGoal.create` → `save` (insert) |
| `POST /api/goals/[id]` | `load` → `renameAndRetarget` / `setOpeningBalance` → `save` |
| `POST /api/goals/[id]/abandon` | `load` → `abandon` → `save` |

`/api/check-in/parse` **zostaje** adapterem AI (I9). Nie dostaje się do agregatu.

Egzekucja przenosi się z klienta na serwer tam, gdzie dziś klient jest jedynym układem batcha semantycznie: klient nadal zbiera pola (UX), ale **tożsamość, atomowość, replace i completion** są wyłącznie w agregacie. UI przestaje być strażnikiem I2 (`hasPayments` zostaje jako hint, serwer i tak rzuci `OPENING_LOCKED`).

Celebracja: API już zwraca listę; UI ma renderować **wszystkie** `completedGoals` (albo kolejkę), nie `[0]`. To cienka zmiana klienta, nie nowa reguła domenowa.

---

## Krok 5 — Before/after, fazy, testy

### 5.1 Before / after per miejsce

| Miejsce | Dziś (before) | Po (after) |
| --- | --- | --- |
| `check-in.ts:82-96` | Pętla `upsert` auto-commit, 500 zostawia ogon | Brak pętli SQL w handlerze; `RecordMonthlyCheckIn` + `saveAll` |
| `check-in.ts:99-113` | Recalk *po* upsertach; pad = drift | `progress()` w pamięci; `saved_amount` w tym samym RPC |
| `check-in.ts:83-90` `onConflict` | Ciche SQL replace | `recordPaymentForMonth` — ta sama polityka korekty, ale nazwana i testowalna bez DB |
| `sync-saved-amount.ts` | Jedyny „niezmiennik”, wołany ad hoc | Usunięty z handlerów; tożsamość w korzeniu + asercja w RPC |
| `payments/[paymentId].ts:84-101` | UPDATE wpłaty, potem recalk | `changePayment` → `save` |
| `payments/.../delete.ts:58-72` | DELETE, potem recalk | `removePayment` → `save` |
| `goals/index.ts:50-59` | INSERT z ręcznym `saved_amount = opening` | `SavingsGoal.create` (inwariant od urodzenia) |
| `goals/[id].ts:93-96` | Warunek `paymentCount === 0` w handlerze | `setOpeningBalance` rzuca `OPENING_LOCKED` |
| `abandon.ts:44-48` | Surowy UPDATE status | `abandon()` |
| Trigger completion | Jedyne miejsce I4; ufa denormalizacji | Agregat ustawia status; trigger zostaje jako siatka albo asercja |
| UNIQUE `(goal_id, payment_month)` | Jedyna twarda I3 | Zostaje |
| `GoalForm` `hasPayments` | UX-kopia serwera | Hint; serwer jest źródłem |
| `ManualCheckInForm` / `GoalQuickPayment` `max` | UX I7 | Zostaje jako UX; serwer `FutureMonthForbidden` |
| `PaymentHistory` bez `max` | I7 tylko serwer | Dodać `max` (spójność UX), reguła i tak w agregacie |
| `completedGoals?.[0]` w 3 komponentach | Połyka N−1 celebracji | Render / redirect uwzględnia całą listę |
| `check-in.test.ts:202-219` | Overwrite jako kontrakt SQL | Overwrite jako kontrakt **domenowy** `recordPaymentForMonth` + test atomowości batcha |
| Projekcja / dashboard | Czyta `saved_amount` | Czyta to samo pole, ale pole jest tożsamością, nie nadzieją |

### 5.2 Fazy refaktoru

Projekt ma Vitest (`npm test`), test-plan z zasadą cheapest-signal (`test-plan.md:15-18`) oraz skill `/10x-tdd` dla faz, których implementacja jeszcze nie istnieje. Fazy 1–2 i przypadki niezmiennika w fazie 3 idą **test-first**. Faza 0 (katalogi) i 4 (RPC/migracja) — nie TDD'owalne w sensie red/green domeny; 4 weryfikowana testem integracyjnym handlera + (jeśli lokalny Postgres) skryptem SQL.

| Faza | Co | Test-first? | Uwaga |
| --- | --- | --- | --- |
| **0** | `src/domain/savings-goal/` + błędy; **zero** zmiany handlerów | Nie (szkielet) | Nie podpinać jeszcze importów z API |
| **1** | `SavingsGoal` + metody z §4.4; in-memory | **Tak** (`/10x-tdd`) | Czysty unit, bez Supabase |
| **2** | `RecordMonthlyCheckIn` z fake repozytorium in-memory (saveAll atomowe vs. sztucznie padające) | **Tak** | Tu pinujemy I1: „drugi cel pada → pierwszy niewidoczny” |
| **3** | Cienkie handlery + mapowanie błędów; usunięcie wywołań `recalcSavedAmount` z dróg wpłat/check-in | **Tak** dla nowych kontraktów HTTP; istniejące testy handlerów przepiąć na fake repo / rpc mock | Nie dublować matematyki w asercjach handlera |
| **4** | Migracja: `save_savings_goals(jsonb)`; adapter repozytorium `rpc` | Częściowo: kontrakt RPC (atomowość, drift raises) jako test SQL lub Vitest z mockiem rpc, potem ręcznie na lokalnym Supabase | Constraint/asercja tożsamości w funkcji |
| **5** | UI: lista celebracji; `max` na edycji miesiąca; usunięcie martwego `sync-saved-amount` | Nie (wyspy React poza `npm test` wg test-plan) | Weryfikacja ręczna / przyszły E2E — nie blokuje faz 1–4 |
| **6** | (osobny, nie ten niezmiennik) I12 `open-ended` / projekcja bez deadline | — | Świadomie **po** I1/I2, bo VO ma czytać spójny postęp |

`recalcSavedAmount` znika dopiero gdy faza 3+4 są zielone. Nie zostawiać dwóch writerów.

### 5.3 Przypadki testowe niezmiennika (legalne / nielegalne)

Warstwa: unit na agregacie i `RecordMonthlyCheckIn` (fake repo). Handler: tylko mapowanie kodu i to, że **nie** woła `upsert`/`recalc`.

**Legalne**

1. Nowy cel z `opening = 500`, brak wpłat → `progress() === 500`.
2. `recordPaymentForMonth(2026-01, 100)` na pustym celu → jeden atom, `progress() === opening + 100`.
3. Drugi `recordPaymentForMonth` **tego samego** miesiąca z kwotą 250 → jeden atom, kwota 250 (korekta; I3 zachowane, I1 „nie duplikuje wiersza”).
4. `recordPaymentForMonth` innego miesiąca → dwa atomy, suma obu.
5. Jawne `0` → wiersz istnieje, wchodzi do sumy jako 0.
6. Check-in dwóch aktywnych celów w jednym `execute` → oba mają wpłatę, oba `saved` zsynchronizowane po `saveAll`.
7. Check-in podzbioru celów (drugi pominięty / pusty w formularzu) → drugi cel nietknięty (to nie jest „zgubienie” — nie było alokacji).
8. Wpłata powodująca `progress >= target` przy `active` → `completed` + `completedAt`.
9. Check-in, w którym **dwa** cele przekraczają target → `completed` zawiera oba id.
10. `changePayment` na wolny miesiąc + nowa kwota → tożsamość trzyma.
11. `removePayment` → postęp spada; status `completed` **nie** wraca do `active`.
12. `setOpeningBalance` gdy brak wpłat.
13. `abandon` z `active`.
14. `renameAndRetarget` obniża target poniżej progress → `completed`.

**Nielegalne (rzucają, stan niezmieniony)**

1. `recordPaymentForMonth` / `changePayment` / `removePayment` / `setOpeningBalance` / `renameAndRetarget` na `completed` lub `abandoned` → `GoalNotActive`.
2. Miesiąc w przyszłości → `FutureMonthForbidden` (check-in i edycja).
3. `changePayment` na miesiąc zajęty przez inny atom → `PaymentMonthConflict` (stan obu atomów bez zmian).
4. `setOpeningBalance` gdy `payments.length > 0` → `OPENING_LOCKED`.
5. `RecordMonthlyCheckIn` z pustą listą → `EmptyCheckIn`.
6. Duplikat `goalId` w alokacjach → `DuplicateGoalInCheckIn`.
7. Alokacja na id, którego `loadMany` nie zwraca (nieaktywny / cudzy / brak) → `CheckInGoalMissing`; **żaden** cel nie zapisany.
8. Fake `saveAll` rzuca przy drugim celu → pierwszy cel w repo **nie** istnieje w nowej wersji (atomowość I1). To jest test, którego **dziś nie da się przejść** na prawdziwym handlerze.
9. `rehydrate` gdy `row.saved_amount !== opening + Σ` → `ProgressDriftDetected`; żadnego `save`.
10. `abandon` na nie-active → `GoalNotAbandonable`.
11. Kwota ujemna na granicy parsera — 400 jeszcze przed agregatem; agregat też odrzuca (`requireAmount`).
12. Nielegalne: ciche kontynuowanie po błędzie — asercja testowa: po catch liczba `saveAll` wywołań wynosi 0 albo jedyne wywołanie zostało wycofane.

Nie testować tu parsera AI (I9–I11) ani net-worth.

### 5.4 Load-bearing nazwy (rejestr kontraktów)

`context/foundation/contract-surfaces.md` **nie istnieje** (10x-init go nie scaffolduje). Gdy zespół otworzy rejestr (`/10x-lesson` / `/10x-contract`), zarejestrować:

| Nazwa | Rodzaj | Dlaczego nośna |
| --- | --- | --- |
| `SavingsGoal` | aggregate root | Jedyny writer postępu i wpłat |
| `MonthlyPayment` | entity wewnątrz korzenia | Atom FR-020–022; UNIQUE cel×miesiąc |
| `OpeningBalance` / `opening_saved_amount` | value / pole | Brak w PRD; bez nazwy projekcje będą „źle” |
| `progress` (tożsamość) | invariant | `opening + Σ payments`; źródło `saved_amount` |
| `RecordMonthlyCheckIn` | application command | Granica I1; nie tabela |
| `recordPaymentForMonth` | domain policy | Jawny replace (korekta miesiąca) |
| `PaymentMonthConflict` | domain error | Reject przy edycji historii |
| `FutureMonthForbidden` | domain error | FR-016 |
| `GoalNotActive` | domain error | I6 |
| `ProgressDriftDetected` | domain error | Fail-fast przy load/persist |
| `EmptyCheckIn` | domain error | Puste ≠ zero |
| `save_savings_goals` | persistence contract | Jedyna transakcja zapisująca N celów |
| `completedGoals: {id, name}[]` | HTTP contract | Cały check-in, nie `[0]` |
| `GOAL_NOT_ACTIVE` / `PAYMENT_MONTH_CONFLICT` / … | error codes | Mapowanie HTTP; UI nie zgaduje stringów PL |

Nie rejestrować jako load-bearing: `recalcSavedAmount` (znika), `onConflict: goal_id,payment_month` w handlerze (znika z API).

---

## Metoda i ograniczenia

- Krok 0–1: PRD, shape-notes, README, tech-stack, roadmap, test-plan, destylacja 01, plan S-03, migracje, `src/lib/goals`, handlery, UI check-inu / historii / GoalForm.
- Wybór #1 nie był założony z góry: I12 i I10 są realnymi rozjazdami, ale nie korumpują zapisu finansowego tak jak brak transakcji check-inu.
- Warstwa `src/domain` nie istnieje — ocena egzekwowania dotyczy SQL + helperów + handlerów + UI.
- Ten dokument nie zmienia kodu produkcyjnego.
- Cytaty `plik:linia` zweryfikowane względem drzewa z 2026-09-14.
