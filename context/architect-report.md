# Raport architektoniczny — moduł 4 (10xArchitect)

Two-pager z artefaktów L2–L5. Źródła: Mattermost (L2–L4) i Saved! (L5). Twierdzenia strukturalne tylko tam, gdzie artefakt je podaje.

---

## 1. Opisane projekty

| Repo | Stack (z artefaktu) | Skala (orientacyjnie) | Artefakty |
| --- | --- | --- | --- |
| **mattermost/mattermost** (`Projekty-zew/mattermost`) | Monorepo: `server` (Go) + `webapp` (TS/React) + `e2e-tests` (Playwright) + `docs` | Duże: `app` i `admin_console` po setki plików, graf webapp ~2k modułów. Graf Go/e2e/docs = unknown. | L2, L3, L4 |
| **Saved!** (`Projekty-moje/saved`) | Astro 6 SSR, React 19, Tailwind 4, Supabase, Cloudflare Workers; AI = binding Workers AI | Mały produkt: CRUD + helpery; **brak** `src/domain/`. BRAK liczby plików/LOC w L5. | L5 |

Artefakty: L2 `context/map/repo-map.md` (okno git 11 Sep 2025 – 11 Sep 2026), L3 `changes/post-flow-analysis/research.md` (HEAD `a73cce0d03`), L4 `changes/refactor-opportunities/plan.md`, L5 `context/domain/01–03-*.md`. Oznaczenia `S#` to numery werdyktów `ast-grep` z L3.

---

## 2. Mapa projektu (L2 — Mattermost)

1. **Rdzeń roku to pion `app` → `model` → `api4`**, nie „frontend vs backend”, a lokalne centrum zależy od narzędzia: w gicie to trio `api4 + app + model` (95% zmian `store.go` ląduje razem z `app`), w grafie importów webapp — jeden cykl obejmujący **1148 modułów** (`admin_console` + `actions` + `utils`, w tym edytor i `post_view`), dalej „cykl 1148”. `app` jest przy tym głębokim hubem: setki plików, większość w korzeniu pakietu, więc katalog kłamie o lokalności zmiany.
2. **Strefy ryzyka — mapa nazywa sześć, trzy niosą ten raport:** kręgosłup config/API (jeden setting rusza cztery drzewa ręcznie, a `types/config` i `default_config` prawie nigdy nie zmieniają się w izolacji — ~95–98% cross-tree), `app` bez grafu importów, oraz `utils.tsx` w jednym cyklu z consolą. Warstwy pakietów `types → client → channels` mają natomiast **0 naruszeń**: dług nie jest odwróconym importem.
3. **Entry pointy dnia 1** (8 plików) prowadzą od kontraktu do miejsca, gdzie git i graf się rozjeżdżają: `config.go` → lustro `types/config.ts` → `client4.ts` → `store.go` → **`app/post.go`**, jedyny czysto domenowy plik w TOP 10 terytorium.
4. **Unknowns:** cały graf importów Go, Playwright i docs, OpenAPI, runtime (websocket, pluginy, Enterprise). Pusta krawędź na diagramie webapp nie znaczy „brak sprzężenia”.

---

## 3. Analiza ficzera (L3 — zapis posta)

**Przepływ:** create normalnego posta (root albo reply). **Dlaczego:** mapa każe czytać `app/post.go` jako kształt silnika, a to prowadzi prosto w strefę ryzyka #2 — `app` bez grafu importów — z satelitami `advanced_text_editor` i `post_view` w cyklu 1148. Consola i kręgosłup configu przy czystym zapisie **nie** muszą się ruszać, a ABAC na create **nie** bramkuje insertu.

**Overview.** Input idzie z composera: `handleSubmitWrapper` → `onSubmit` → redux `createPost` (post optymistyczny) → `Client4.createPost` → `POST /api/v4/posts` → `createPostChecks` → `App.CreatePost` → `PostStore.Save` → `INSERT Posts` plus tabele poboczne. Stan zmienia się w wierszu `Posts`; po zapisie idą jeszcze załączniki, pluginy i `handlePostEvents` → `SendNotifications`. Wraca dwiema drogami: HTTP **201** z JSON-em **oraz** websocket `posted` — klient zamyka post optymistyczny, `post_view` czyta `postsInChannel`.

**Dług — trzy z dziewięciu opisanych w L3:**

1. **`App.CreatePost` to pęk skutków ubocznych, nie insert.** Jedyny produkcyjny `Post().Save` siedzi w `CreatePost` (`post.go:393`, S13), a fan-in to **45** produkcyjnych call-site’ów w **16** plikach (S8). `createPostChecks` ma przy tym dokładnie **1** wywołanie, `api4/post.go:134` (S15/S36) — plugin, webhook, slash, job i `channel.go` (17 wywołań) omijają ten szew HTTP. Blast radius idzie przez pięć warstw, a mapa grafu Go nie narysuje.
2. **Testy klienta nie dotykają persistencji.** Serwer pokrywa happy path, ale composer mockuje następną warstwę i `Client4.createPost` nie ma ani jednego testu (S23). Posting w Playwright to fixture, nie kontrakt: 167 wywołań `createPost` i 296 `postMessage` w e2e (S39).
3. **Composer jest wpięty w cykl 1148.** `onSubmit` importuje zbiorczy `utils/utils` tylko po dwa czyste symbole (S5), więc unit testujący submit ciągnie za sobą store i HTTP — to przypadkowa złożoność i zarazem przedmiot planu z sekcji 4.

---

## 4. Plan refaktoryzacji (L4 — Mattermost)

**Opcja:** wąski wycinek **C4** — wyjęcie `getTimestamp` i `REACTION_PATTERN` do czystego `utils/composer_submit.ts`, żeby composer zszedł ze zbiorczego `utils.tsx` — plus tani guard **C2**, czyli `TestHandlePostEvents`. Docelowo `handlePostEvents` ma własny test bramek orkiestracji, a to, że `CreatePost` **połyka** błąd fan-outu, staje się jawną asercją zamiast niepisanego zachowania. Zbiorczy `utils.tsx` re-eksportuje oba symbole dla czterech pozostałych callerów; sygnatura `CreatePost` i kolejność Save/`Overwrite` bez zmian.

**Świadomie nie:** C6 (wspólna kompozycja `createPostChecks`/`scheduledPostChecks`), C1 (lustra `Post` Go/TS/OpenAPI), C3 (`searchlayer` w `store-layers`), C5 (bramka na wszystkie 45 call-site’ów — STOP), reszta post-save, luki klienta poza unitem `:emoji:`, ABAC-na-create, rozplątywanie cyklu 1148. Ani Strangler, ani Branch by Abstraction.

| Faza | Co | Weryfikacja |
| --- | --- | --- |
| 1 Guard C2 | `TestHandlePostEvents` (notyfikacje, webhook, auto-response, burn-on-read) + subtest „swallow”; zero diffu w `post.go` | **Auto:** `go test ./channels/app`. **Ręcznie:** diff tylko `post_test.go`; `require.Eventually`, nie `sleep` |
| 2 Charakteryzacja | Unit routingu `:emoji:` na zastanym `onSubmit`; zero kodu produkcyjnego | **Auto:** Jest + `rg` nadal widzi stary import. **Ręcznie:** diff tylko test; zachowanie zastane, nie docelowe |
| 3 Liść C4 | `composer_submit.ts`, re-export, composer schodzi z `utils.tsx` | **Auto:** ten sam Jest, `check-types`, `rg` importu = 0. **Ręcznie:** post, `/away`, `+:smile:` |

Wszystkie checkboxy w Progressie planu są **otwarte** — nic z tego nie jest jeszcze wdrożone.

---

## 5. Domena wg DDD (L5 — Saved!)

**Język (4):** *cel oszczędnościowy* (`savings_goals`, cykl active/completed/abandoned); *check-in miesięczny* — AI albo ręczny, przypadek użycia bez własnej encji (**BRAK** tabeli `check_ins`); *wpłata-atom* (`goal_payments`, UNIQUE cel×miesiąc); *odłożone* (`saved_amount`) kontra *saldo startowe* (`opening_saved_amount` — **BRAK w PRD**, istnieje tylko w kodzie).

**Najważniejsze rozjazdy model-vs-kod:** (1) PRD chce, by zapisany check-in był spójną całością, a zapis to pętla upsert **bez transakcji**, w której drugi check-in cicho nadpisuje pierwszy; (2) bez deadline PRD obiecuje samą sumę i status „open-ended”, a kod i tak liczy oraz renderuje projekcję daty, przy czym typ statusu nie zna wartości `open-ended` i zwraca `null`.

**Niezmiennik #1:** I1 ∧ I2 — zapisany check-in jest całością (albo cała alokacja miesiąca wraz ze zsynchronizowanym postępem, albo stan nietknięty) **oraz** `saved_amount = opening_saved_amount + Σ wpłat`. **Agregat:** `SavingsGoal`, czyli cel razem ze swoimi wpłatami. Check-in zostaje komendą `RecordMonthlyCheckIn` na N korzeniach w **jednej** transakcji (RPC `save_savings_goals`), a nie nową tabelą; unikalność miesiąca i auto-complete wychodzą z tego jako konsekwencje.

**ACL:** przecieka **Workers AI** (`env.AI`, globalny typ `Ai`, model `@cf/meta/llama-3.1-8b-instruct-fp8`) mimo obietnicy „LLM na dowolnym stacku”. Przez **2 warstwy produkcyjne**: handler `parse.ts` importuje `cloudflare:workers`, a helper `parseCheckInSentence(ai: Ai)` w `src/lib` nosi typ vendora w sygnaturze — plus globalny `Ai` widoczny w całej kompilacji, także dla wysp React (`include: **/*`). UI nie importuje `Ai`, ale duplikuje DTO parsera. Supabase przecieka szerzej, tylko że dokumenty **zamykają** go świadomie — dlatego nie jest #1.

---

## 6. Decyzje, które należą do mnie

Przez cały moduł powtarzał się jeden ruch, który należy do mnie: **brałam zakres za szeroko, a potem sama go zawężałam**, bo AI chętniej dokłada kandydatów niż ich odrzuca. W L3 zeszłam z „całego procesu zapisu i wszystkich powiązanych obszarów mapy” do samego create normalnego posta — bez wypchnięcia edycji, ephemeral i scheduled do sąsiadów fan-in 45 call-site’ów byłby oszacowany, nie policzony. W L4 research podał ranking C2 → C4 → C6 i sam nazwał go „propozycją, nie decyzją”; zdjęłam z niego C6 i zostawiłam liść C4 z guardem C2, bo w cudzym repo tej skali wolę oddać dwie fazy testowe bez linii diffu w produkcyjnym `post.go` niż jedną przebudowę orkiestratora — kolejność „test charakteryzujący przed extractem” też jest moja, nie z rankingu. W L5 z 20 niezmienników i czterech kandydujących granic wybrałam I1∧I2 na jednym agregacie `SavingsGoal`, odkładając „open-ended” i FR-035, bo tylko tam złamanie reguły kończy się korupcją danych finansowych, a nie mylącym komunikatem; dlatego też check-in został komendą, nie tabelą `check_ins`, której PRD nie zna. Przy ACL odrzuciłam Supabase mimo największej liczby plików: naprawiam złamaną obietnicę, nie najgrubszą zależność — wymienialność dokumenty obiecują wyłącznie dla warstwy LLM.
