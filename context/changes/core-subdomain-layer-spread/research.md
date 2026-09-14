---
date: 2026-09-14T10:29:25+02:00
researcher: Grok
git_commit: fa09ad7772ca14a13d5055ed2a16f004537ca340
branch: testing-ai-safety-path
repository: kapaminska/saved
topic: "How deeply is the Core subdomain smeared across layers?"
tags: [research, codebase, core, ddd, goals, check-in, projection, layers]
status: complete
last_updated: 2026-09-14
last_updated_by: Grok
---

# Research: How deeply is the Core subdomain smeared across layers?

**Date**: 2026-09-14T10:29:25+02:00
**Researcher**: Grok
**Git Commit**: [fa09ad7772ca14a13d5055ed2a16f004537ca340](https://github.com/kapaminska/saved/commit/fa09ad7772ca14a13d5055ed2a16f004537ca340)
**Branch**: testing-ai-safety-path
**Repository**: kapaminska/saved

## Research Question

Z `context/domain/01-domain-distillation.md`: jak głęboko subdomena **Core** (cel oszczędnościowy + check-in miesiąca + tempo/projekcja/status) jest dziś rozsmarowana po warstwach — UI, API, `src/lib/`, persystencja, testy — skoro **nie ma** `src/domain/` ani agregatów.

Poza zakresem: wartość netto, profil, auth (poza tym, gdzie przecinają Core: `PROTECTED_ROUTES`, RLS, tabela `ai_checkin_requests`).

## Summary

**Core przechodzi pionowo przez cały stos, ale nie ma domu.** Nie istnieje warstwa domeny. Ten sam niezmiennik ma zwykle 2–4 miejsca egzekwowania, często z inną polityką. Najgrubsza warstwa to **handlery Astro API** (de-facto komendy domenowe). `src/lib/goals/` to najbliższy „kernel” (czysta matematyka + adaptery). SQL trzyma kształt CRUD i kilka twardych constraintów, **nie** tożsamość postępu ani atomowość check-inu. UI niesie język wszechobecny po polsku i kopie strażników, plus kilka reguł, których serwer nie zna.

Szacunek pojęcia → persystencja: **~40% Core ma ślad w DB, ~60% jest tylko w aplikacji.** Najgłębsze rozsmarowanie to nie „za dużo SQL”, tylko **rozszczepienie prawdy finansowej** (`goal_payments` vs zdenormalizowane `saved_amount`) i **check-in jako skrypt trasy**, nie encja.

| Warstwa | Rola wobec Core | Głębokość |
| --- | --- | --- |
| Persystencja | Tabele celu/wpłat, UNIQUE cel×miesiąc, CHECK statusu, trigger ukończenia; **brak** check-inu, projekcji, tożsamości postępu | Średnia struktura, niska semantyka |
| `src/lib/goals/` | Czyste parsery + projekcja; mieszany `recalcSavedAmount`; adaptery AI i loadeery stron w tym samym folderze | Najbliższy kernel, silnie zmieszany |
| API | Grube komendy: pętla upsert, lock salda startowego, 409 active-only, overwrite vs reject | **De-facto warstwa domeny** |
| UI | Słownik PL, 5–6 skopiowanych strażników, 2 sole guardians (`completedGoals[0]`, brak `open-ended`) | Głęboki język, średnie niezmienniki |
| Testy | Orakulum **dialektu serwera** (w tym overwrite i fail-closed `amount: 0`); zero `*.test.tsx` | Głębokie na API/lib, ślepe na wyspy |

## Detailed Findings

### 0. Granica Core (z destylacji)

Core w tym badaniu:

1. **Cel** — `target_amount`, `saved_amount`, `opening_saved_amount`, `deadline`, cykl `active/completed/abandoned`, celebracja, archiwum.
2. **Check-in** — komenda miesiąca (AI + ręczny), review, propozycje, nierozpoznane nazwy, atom wpłaty, 0 vs pominięcie, zakaz przyszłości.
3. **Tempo / projekcja / status** — `requiredPace`, data ukończenia, N miesięcy, `ahead/on_track/behind`, brakujące `open-ended`.

Parser AI jest **supporting adapterem** siedzącym fizycznie w `src/lib/goals/ai-checkin/` — to też jest smear: adapter rdzenia leży w tym samym drzewie co matematyka tempa.

`src/domain/` **nie istnieje**. Brak klas agregatu, `DomainError`, nazwanych niezmienników w kodzie produkcyjnym.

---

### 1. Persystencja — kształt CRUD, nie granica spójności

Trzy tabele w `public` niosą Core + wyciek supporting:

| Artefakt | Co trzyma | Cytat |
| --- | --- | --- |
| `savings_goals` | Tożsamość celu, denormalizowany postęp, lifecycle | [`create_savings_goals.sql:2-13`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623120000_create_savings_goals.sql#L2-L13) |
| `opening_saved_amount` | Saldo startowe (brak w PRD) | [`add_opening_saved_amount.sql:1-3`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623150000_add_opening_saved_amount.sql#L1-L3) |
| Trigger `check_savings_goal_completion` | A2: `active` + `saved_amount >= target` → `completed` | [`create_savings_goals.sql:32-49`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623120000_create_savings_goals.sql#L32-L49) |
| `goal_payments` | Atom wpłaty; `amount >= 0` (jawne 0); UNIQUE `(goal_id, payment_month)` | [`create_goal_payments.sql:2-11`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623140000_create_goal_payments.sql#L2-L11) |
| RLS celów | SELECT/INSERT/UPDATE; **brak DELETE** | [`create_savings_goals.sql:19-26`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623120000_create_savings_goals.sql#L19-L26) |
| RLS wpłat | w tym DELETE | [`create_goal_payments.sql:27-28`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623140000_create_goal_payments.sql#L27-L28) |
| `ai_checkin_requests` | Log prób parsera (supporting obok finansów) | [`create_ai_checkin_requests.sql:2-6`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623160000_create_ai_checkin_requests.sql#L2-L6) |

**ABSENT w SQL (całe kawałki Core):** tabela `check_ins`; kolumny projekcji/tempa/statusu tempa; `open-ended`; celebracja; archiwum (to filtr `status`); CHECK `payment_month` = 1. dzień / nie-przyszłość; CHECK `saved_amount = opening + Σ payments`; CHECK `goal_payments.user_id` = właściciel celu; blokada restore `→ active` (UPDATE policy **pozwala** dowolny status).

Typy wygenerowane powtarzają kolumny (`src/types/database.ts:36-133`), ale `Functions` i `Enums` są puste (`database.ts:196-197`) — trigger ukończenia żyje w Postgresie, TypeScript go nie widzi. `status` jest `string`, nie unią.

**Denormalizacja jest udokumentowana w komentarzu migracji** (`create_savings_goals.sql:1`) i **nie** ma niezmiennika SQL. Trigger ukończenia czyta **cache** `saved_amount`, nie sumę wpłat — drift A1 psuje A2 (fałszywe albo pominięte „Saved!”).

---

### 2. `src/lib/goals/` — najbliższy kernel, worek helperów

11 plików produkcyjnych w jednym folderze, bez granicy pakietu:

| Klasa | Pliki | Udział |
| --- | --- | --- |
| Czysta matematyka / parsery | `projection.ts`, `payment-validation.ts`, `validation.ts`, `goal-name-match.ts`, `parse-schema.ts`, `nl-input-validation.ts` | ~40% |
| Mieszane (wzór + I/O) | `sync-saved-amount.ts` | ~10% |
| Adaptery (Supabase / Workers AI / SSR) | `parse-checkin.ts`, `rate-limit.ts`, `detail-page.ts`, `edit-page.ts` | ~35% |

**Tożsamość postępu jest procedurą, nie niezmiennikiem:**

```29:34:src/lib/goals/sync-saved-amount.ts
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const total = goal.opening_saved_amount + paymentTotal;

  const { data, error } = await supabase
    .from("savings_goals")
    .update({ saved_amount: total })
```

Trzy round-tripy, każdy auto-commit. Komunikaty błędów po angielsku (`"Failed to load goal"`) przeciekają na polski API.

**Projekcja miesza dwa źródła prawdy:**

| Wynik | Czyta `saved_amount` | Czyta wiersze wpłat |
| --- | --- | --- |
| `averageMonthlyPayment` / `monthsOfData` | nie | tak (luki = 0) |
| `requiredPace` | tak `(target − saved) / miesiące` | nie |
| `projectedCompletionDate` | tak (pozostałe) | pośrednio przez średnią |
| `status` | pośrednio | pośrednio |

```6:16:src/lib/goals/projection.ts
export type GoalStatus = "ahead" | "on_track" | "behind";
export interface GoalMetrics {
  requiredPace: number | null;
  projectedCompletionDate: string | null;
  status: GoalStatus | null;
  ...
}
```

`open-ended` **nie istnieje** jako wartość — brak deadline → `null` (`projection.ts:159-161`). Projekcja daty **nie** sprawdza deadline (`projection.ts:142-157`, `182-187`) — rozjazd FR-005 żyje w czystej funkcji, UI tylko ją renderuje.

`formatMonthsOfData` jest **zduplikowane**: używane z `projection.ts:84`; martwy bliźniak w `src/lib/i18n/format.ts:25-33`.

UL w TypeScript jest połowiczne: `GoalStatus`, `requiredPace`, `ParsedProposal`, `UnrecognizedEntry` są typami; „check-in”, „atom”, agregat — nie. Błędy miesiąca mówią „check-in” po polsku (`payment-validation.ts:72`), nie jako typ.

Loader stron (`detail-page.ts`, `edit-page.ts`) siedzi w `lib/goals/` i koduje `editable: status === "active"` oraz `hasPayments` — reguła lifecycle w adapterze SSR.

---

### 3. API — de-facto warstwa domeny

Siedem handlerów POST, zero `src/domain`, zero transakcji, zero RPC:

| Endpoint | Plik | Grubość |
| --- | --- | --- |
| `POST /api/goals` | `src/pages/api/goals/index.ts` | średnia — insert z `saved = opening` |
| `POST /api/goals/[id]` | `src/pages/api/goals/[id].ts` | **gruba** — lock opening gdy `paymentCount === 0` |
| `POST /api/goals/[id]/abandon` | `abandon.ts` | cienka orkiestracja, bramka statusu inline |
| `POST /api/check-in` | `src/pages/api/check-in.ts` | **gruba komenda** = cały check-in |
| `POST /api/check-in/parse` | `parse.ts` | cienki adapter; **nie** zapisuje wpłat |
| `POST .../payments/[paymentId]` | edit | **gruba** — reject kolizji miesiąca |
| `POST .../payments/.../delete` | delete | średnia — delete + recalc |

Check-in jako skrypt trasy:

```82:113:src/pages/api/check-in.ts
  for (const entry of entries) {
    const { error: upsertError } = await supabase.from("goal_payments").upsert(
      { ... },
      { onConflict: "goal_id,payment_month" },
    );
    if (upsertError) {
      return jsonResponse({ success: false, error: "Nie udało się zapisać wpłaty" }, 500);
    }
  }
  // druga pętla: recalcSavedAmount per cel — poza transakcją
```

Pusty amount = skip (`check-in.ts:48-50`); `"0"` = wiersz. To jest I8 w handlerze, nie w lib.

**Ta sama unikalność cel×miesiąc, dwie polityki:**

| Ścieżka | Polityka | Mechanizm |
| --- | --- | --- |
| Check-in | **overwrite** | `upsert` `onConflict` |
| Edycja historii | **reject** 409 | preflight `conflict` |

Duplikacja bramki `status !== "active"` → 409 z tym samym polskim zdaniem w **czterech** handlerach (`[id].ts:47-48`, `abandon.ts:40-41`, payment edit `:43-44`, delete `:42-43`). Check-in i parse filtrują `status = active` query.

`PROTECTED_ROUTES` nie obejmuje `/api/*` (`src/middleware.ts:4`) — strony Core są za middleware, **komendy Core tylko za `locals.user` w handlerze**.

Parse jest poprawnie poza zapisem finansowym (`parse.ts:83-88` zwraca `proposals` / `unrecognized`). Review jest ścieżką UI, nie constraitem serwera: klient może POST `/api/check-in` bez review.

---

### 4. UI — język Core + kopie strażników + dwa sole guardians

**Strony SSR:** `dashboard.astro` (najgęstsza powierzchnia), `goals/[id]/index.astro` (kopia chrome metryk), `goals/archive.astro` (split Ukończone/Porzucone, bez restore), `goals/new.astro` / `edit.astro` (shell). Landing powtarza pętlę Core po polsku, w tym trzy statusy tempa **bez** open-ended (`LandingPage.astro:77-100`).

Dashboard i detail **nie** dublują matematyki — wołają `computeGoalMetrics`. Dublują **prezentację**: lokalne `progressPercent`, te same etykiety tempa/prognozy, ten sam warunek „pokaż projekcję jeśli data istnieje” (także bez deadline).

**Wyspy z kopią niezmiennika (strażnik jest też na serwerze):**

1. `max={defaultMonth}` — `ManualCheckInForm.tsx:58`, `AiCheckInTab.tsx:324`, `GoalQuickPayment.tsx:125`. **`PaymentHistory` nie ma `max`** (`PaymentHistory.tsx:131-140`) — na edycji historii jedyny strażnik I7 to serwer.
2. 500 znaków / pusty NL — `AiCheckInTab` vs `nl-input-validation.ts`.
3. Regex nazwy/targetu/odłożonego — `GoalForm.tsx` vs `validation.ts`. UI **wymaga** opening saved; serwer `parseSavedAmount("")` **defaultuje do 0**.
4. Lock `saved_amount` gdy są wpłaty — `GoalForm` + `hasPayments` z `edit-page.ts:58` vs `goals/[id].ts:93-96`.
5. Skip pustego amount przed POST — `CheckInModal` / `AiCheckInTab` vs handler.

**UI jako jedyny strażnik:**

| Reguła | Gdzie | Serwer |
| --- | --- | --- |
| Celebracja tylko `completedGoals[0]` | `CheckInModal.tsx:84`, `AiCheckInTab.tsx:173`, `GoalQuickPayment.tsx:60` | Handler zwraca **całą** tablicę (`check-in.ts:115`) |
| Brak etykiety `open-ended` | `GoalStatusBadge.tsx:23-24` → `null` = nic | Lib też nie zna wartości |
| Warning FR-006 | `GoalForm.tsx:217-221` („śledzenie postępu”, bez „projekcja”) | Edycja dozwolona bez warningu |
| Historia bez pominiętych miesięcy | `PaymentHistory.tsx:104-109` | Projekcja traktuje luki jako 0 |

Brand FR-010 jest rozszczepiony: lockup „Saved!”, modal **„Cel osiągnięty!”**, formularz **„Zapisano!”**.

Słownik EN typy / PL UI: `on_track` → „Na dobrej drodze”; `requiredPace` → „Wymagane tempo”; `opening_saved_amount` ukryte pod „Już odłożono”.

---

### 5. Testy — dialekt serwera zamrożony, wyspy nie

**Zero `*.test.tsx`.** Orakulum Core to Vitest na lib + handlerach.

Zamrożone (i czasem rozbieżne z PRD):

- Overwrite check-inu jako **sukces** (`check-in.test.ts:202-220`).
- Jawne `"0"` vs pusty skip (`check-in.test.ts:165-199`).
- Future month 400, bez upsert (`check-in.test.ts:153-162`).
- `amount: 0` w JSON AI → schema `{ ok: false }` (`parse-schema.test.ts:19-23`); handler mapuje na 503 — **brak testu HTTP** „amount 0 → 503”.
- Parse nie zapisuje wpłat (`parse.test.ts`).
- `saved = opening + Σ` (`sync-saved-amount.test.ts`).
- Lock opening gdy są wpłaty (`goals/[id].test.ts:75-93`).
- Status `null` bez deadline — **pinuje brak `open-ended`** (`projection.test.ts`).
- Projekcja **liczy się** bez deadline — testy tego nie zakazują.

**Niezamrożone (dialekt UI):** `completedGoals[0]`; review; `max` miesiąca; projekcja renderowana bez deadline; luki w historii; warning FR-006.

Testy RLS (`supabase/tests/rls-savings-goals.sql`, `rls-goal-payments.sql`) pinują izolację, nie tożsamość postępu.

---

### 6. Mapa rozsmarowania per pojęcie Core

Legenda warstw: **SQL** · **lib** · **API** · **UI** · **test**. „Głębokość” = ile warstw musi się zmienić, żeby reguła miała jeden dom.

| Pojęcie Core | SQL | lib | API | UI | Test | Werdykt smear |
| --- | --- | --- | --- | --- | --- | --- |
| Cel jako wiersz | tabela | DTO `formatGoalRow` | create/update | GoalForm, strony | create/update tests | Płytki CRUD, wszędzie |
| `saved_amount` tożsamość | **brak** CHECK | `recalcSavedAmount` | 3 handlery wołają po mutacji | pasek z denorm | sync tests | **Najgłębszy** — procedura + cache |
| Auto-complete A2 | **trigger** | — | obserwuje `completed` | celebracja | check-in completedGoals | SQL jedyny writer statusu; UI/API tylko czytają |
| `opening_saved_amount` | kolumna | wzór recalku | create + lock na edit | „Już odłożono” | index + [id] tests | Ukryty byt domenowy, 4 warstwy |
| Cykl active/completed/abandoned | CHECK + no DELETE | loadery `editable` | 409 × 4 + abandon | etykiety, archive, AbandonGoal | abandon + 409 | Powtórzona bramka, brak typu unii |
| Check-in jako całość | **brak tabeli** | skip/0 nie tu | **pętla upsert** | 3 wyspy → ten sam POST | overwrite pinned | Encja nie istnieje; komenda = route |
| UNIQUE cel×miesiąc | UNIQUE | — | overwrite **vs** 409 | cisza | overwrite + conflict 409 | Jedna reguła, dwie semantyki |
| Przyszły miesiąc | **brak** | `validateCheckInMonth` | check-in + payment edit | `max` na 3/4 formularzach | unit + handler | Lib+API OK; UI dziura na historii |
| 0 vs pominięcie | `amount >= 0` | średnia luk = 0 | skip pustego | przycisk 0 / placeholder | handler + projection | Zapis i średnia spójne; historia nie |
| Review przed zapisem AI | — | parse → proposals | `/parse` ≠ `/check-in` | stany widoku | parse no-write | Ścieżka OK; UI nie jest constraitem |
| Unrecognized / amount ≤ 0 AI | — | matcher + Zod `gt(0)` | 503 na cały parse | flaga + „utwórz osobno” | schema unit | Supporting w folderze Core |
| Tempo / status tempa | **brak** | `GoalStatus` + `null` | — | badge PL; landing 3 statusy | projection tests | Czysty kernel; semantyka `open-ended` nigdzie |
| Projekcja bez deadline | — | **liczy się** | — | **pokazuje** | nie zabrania | Smear semantyczny lib+UI vs PRD |
| Celebracja | — | — | lista `completedGoals` | **`[0]` + `?celebrated=`** | tylko kształt odpowiedzi | Sole guardian UI |
| Archiwum | filtr statusu | — | — | `archive.astro` | — | Czysta prezentacja |
| Rate-limit AI | tabela prób | `rate-limit.ts` | 429 | CTA ręczny | parse 429 | Supporting przyklejony do Core |

**Najgłębiej rozsmarowane (4+ warstwy, niespójna polityka):** tożsamość `saved_amount`; check-in jako całość; UNIQUE z dwiema semantykami; opening balance.

**Najczyściej skupione:** matematyka tempa/średniej (lib, testowana); trigger ukończenia (SQL); parse-nie-zapisuje (ścieżka API).

---

## Code References

- [`supabase/migrations/20260623120000_create_savings_goals.sql:2-13,32-49`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623120000_create_savings_goals.sql#L2-L13) — tabela celu, CHECK statusu, trigger ukończenia na denorm
- [`supabase/migrations/20260623140000_create_goal_payments.sql:2-11,27-28`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623140000_create_goal_payments.sql#L2-L11) — atom wpłaty, UNIQUE, DELETE RLS
- [`supabase/migrations/20260623150000_add_opening_saved_amount.sql:1-3`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/supabase/migrations/20260623150000_add_opening_saved_amount.sql#L1-L3) — saldo startowe poza PRD
- [`src/lib/goals/sync-saved-amount.ts:29-34`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/lib/goals/sync-saved-amount.ts#L29-L34) — jedyny zapis tożsamości postępu
- [`src/lib/goals/projection.ts:6-16,121-196`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/lib/goals/projection.ts#L6-L16) — VO tempa/statusu; split saved vs historia
- [`src/lib/goals/payment-validation.ts:57-75`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/lib/goals/payment-validation.ts#L57-L75) — zakaz przyszłości
- [`src/pages/api/check-in.ts:48-50,82-113`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/pages/api/check-in.ts#L82-L113) — skip/0, upsert bez tx, recalc po fakcie
- [`src/pages/api/goals/[id].ts:47-48,93-96`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/pages/api/goals/%5Bid%5D.ts#L47-L48) — active-only + lock opening
- [`src/pages/api/goals/[id]/payments/[paymentId].ts:70-80`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/pages/api/goals/%5Bid%5D/payments/%5BpaymentId%5D.ts#L70-L80) — reject kolizji miesiąca
- [`src/pages/api/check-in/parse.ts:51-88`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/pages/api/check-in/parse.ts#L51-L88) — adapter AI, brak zapisu wpłat
- [`src/pages/dashboard.astro:186-218`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/pages/dashboard.astro#L186-L218) — pasek z denorm, projekcja bez wymogu deadline
- [`src/components/goals/GoalStatusBadge.tsx:8-24`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/components/goals/GoalStatusBadge.tsx#L8-L24) — trzy statusy PL; `null` milczy
- `src/components/goals/GoalForm.tsx:79-93,184-221` — lock opening + warning FR-006 (plik brudny w working tree względem HEAD)
- [`src/pages/api/check-in.test.ts:202-220`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/pages/api/check-in.test.ts#L202-L220) — overwrite jako kontrakt
- [`src/middleware.ts:4`](https://github.com/kapaminska/saved/blob/fa09ad7772ca14a13d5055ed2a16f004537ca340/src/middleware.ts#L4) — Core pages w `PROTECTED_ROUTES`; API nie

## Architecture Insights

1. **To nie jest „anemiczny model z grubymi serwisami”.** Nie ma serwisów. Jest **CRUD + procedury rozrzucone po trasach Astro**. Destylacja to nazwała; to badanie mierzy *jak głęboko*: każdy pion (cel, wpłata, check-in, projekcja) przecina inną kombinację warstw.

2. **Dwa jądra, zero granicy.** Czysta projekcja w `lib` jest testowalna i względnie czysta. Integralność zapisu żyje w handlerach + procedurze recalku + triggerze. Refaktor agregatu z `02-invariant-aggregate-refactor.md` celuje w to rozszczepienie, nie w net-worth.

3. **Smear poziomy (duplikacja) vs pionowy (przecięcie warstw).** Pionowy smear Core jest nieunikniony w SSR (strona musi pokazać tempo). Szkodliwy jest poziomy: ta sama bramka `active` w 4 handlerach + 2 loaderach + UI; UNIQUE z overwrite i reject; `progressPercent` w dwóch `.astro`; `formatMonthsOfData` dwa razy.

4. **UI nie jest drugim silnikiem projekcji** — to dobra wiadomość. Jest drugim **słownikiem** i drugim **zestawem strażników HTML**. Jedyny silny bug produktowy zakodowany wyłącznie w UI to połykanie celebracji `[0]`.

5. **Testy konserwują smear.** Overwrite, brak `open-ended`, `amount: 0` → fail-closed całego parse — to jest obecny model, nie PRD. Wydzielenie agregatu bez przepisania tych testów utrwali stare polityki.

6. **Supporting AI jest dobrze odcięty ścieżką** (`/parse` vs `/check-in`), **źle odcięty katalogiem** (leży w `lib/goals/` obok `projection.ts` i recalku).

## Historical Context (from prior changes)

- `context/domain/01-domain-distillation.md` — kanoniczna klasyfikacja Core vs supporting; ranking refaktoru #1 = cel + komenda check-inu. To research **mierzy rozsmarowanie** tej subdomeny, nie powtarza destylacji.
- `context/domain/02-invariant-aggregate-refactor.md` — plan agregatu-strażnika I1∧I2; krok 0 już zgadza się z mapą warstw (CRUD + procedury, brak tx). Ten dokument dostarcza **pełną mapę smear** jako wejście do ewentualnego `/10x-plan`.
- `context/archive/2026-06-23-manual-checkin-payments-projections/plan.md` — UNIQUE cel×miesiąc i „recalc on the same transaction” **zadeklarowane**; implementacja recalku jest poza transakcją (potwierdzone tu w `check-in.ts:82-113`).
- `context/changes/testing-ai-safety-path/research.md` — parse nie zapisuje wpłat; `ai_checkin_requests` przed modelem. Potwierdza, że adapter AI jest poza zapisem finansowym mimo fizycznego sąsiedztwa.
- `context/archive/2026-09-03-testing-critical-path-coverage/research.md` — Risks #1/#2 (assignment, unique month, skip vs 0, future). Testy Phase 1 **przypięły overwrite**, czyli dzisiejszy smear UNIQUE.

## Related Research

- [`context/changes/testing-ai-safety-path/research.md`](../../changes/testing-ai-safety-path/research.md) — granica parse vs zapis (supporting AI)
- [`context/changes/testing-isolation-and-abuse/research.md`](../../changes/testing-isolation-and-abuse/research.md) — izolacja / RLS (generic, tnie Core tabele)
- [`context/archive/2026-09-03-testing-critical-path-coverage/research.md`](../../archive/2026-09-03-testing-critical-path-coverage/research.md) — check-in assignment i integralność wpłat

## Open Questions

1. Czy jedyny ruch warty planu to **ściągnięcie I1/I2 do jednego writera** (`02` już to wybiera), czy najpierw **spłaszczyć duplikację bramek** (`active`, `max` miesiąca, `progressPercent`) bez agregatu?
2. Polityka UNIQUE: zostawić overwrite na check-inie i reject na edycji (dwie intencje), czy ujednolicić? Testy Phase 1 traktują overwrite jako kontrakt.
3. Czy `open-ended` i „nie pokazuj projekcji bez deadline” to follow-up VO (jak w destylacji #2), czy część tego samego wyciągnięcia Core? Matematyka jest w jednym pliku — tanie, ale zależy od spójnego `saved_amount`.
4. Czy `ai-checkin/` powinno fizycznie wyjść z `lib/goals/` przy wyciąganiu `src/domain/savings-goal/`, żeby supporting nie wjechał do agregatu?
5. `GoalForm.tsx` jest zmodyfikowany w working tree względem commitu tej research — lock opening i warning cytowane z drzewa roboczego, nie z permalinku HEAD.
