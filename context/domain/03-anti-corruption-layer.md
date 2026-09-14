---
title: "Saved! — anti-corruption layer dla parsera check-inu"
created: 2026-09-14
type: refactor-plan
sources:
  - context/foundation/prd.md
  - context/foundation/tech-stack.md
  - context/foundation/infrastructure.md
  - context/foundation/roadmap.md
  - context/foundation/test-plan.md
  - context/domain/01-domain-distillation.md
  - context/domain/02-invariant-aggregate-refactor.md
  - README.md
  - context/archive/2026-06-23-ai-checkin-safety/plan.md
  - package.json
  - wrangler.jsonc
limitation: null
---

# Plan: Anti-Corruption Layer

Produkt mapy: **plan refaktoru, nie implementacja**. Kod produkcyjny nie został zmieniony. Która zależność przecieka i jak nazywają się byty — wynik odkrycia, nie założenia z szablonu.

Relacja do `02-invariant-aggregate-refactor.md`: tam #1 to **agregat celu** (integralność zapisu). Tutaj oś to **przeciek vendorów przez warstwy**. Inny ranking, inna granica. Oba plany mogą iść równolegle.

---

## Krok 0 — Kontekst

Dokumenty bazowe **istnieją**. Kanoniczne źródło domeny: `context/foundation/prd.md`. Stack: `context/foundation/tech-stack.md`, `README.md`. Platforma: `context/foundation/infrastructure.md`. Destylacja: `01-domain-distillation.md`. Memory Bank (`memory-bank/`) **nie istnieje**.

**Wizja (skrót).** Jedno zdanie NL raz w miesiącu → strukturalne wpłaty, postęp, projekcja. AI = parser języka naturalnego i nic więcej. Awaria AI nigdy nie blokuje użytkownika (`prd.md:40`, `prd.md:189`).

**Stack z manifestu** (`package.json:17-40`): Astro 6, React 19, Tailwind 4, `@supabase/ssr` + `@supabase/supabase-js`, Zod, `canvas-confetti`, shadcn/radix. Runtime: Cloudflare Workers (`@astrojs/cloudflare`). **Workers AI nie jest pakietem npm** — to binding `env.AI` z `wrangler.jsonc:15-18`.

**Warstwy kodu (odkryte, brak `src/domain/`):**

| Warstwa | Gdzie |
| --- | --- |
| UI (wyspy React) | `src/components/{goals,net-worth,profile,auth}/` |
| UI (SSR Astro) | `src/pages/*.astro` — frontmatter woła Supabase bezpośrednio |
| API | `src/pages/api/**` |
| Helpery / „serwis” | `src/lib/goals/`, `src/lib/net-worth/`, `src/lib/supabase.ts` |
| Persystencja | `supabase/migrations/`, `src/types/database.ts` |
| Typy runtime CF | `worker-configuration.d.ts` (globalne, `tsconfig.json:4` `include: **/*`) |

### Deklaracje wymienialności (intencja)

Trzy cytaty, które **nie** opisują tego, co robi kod:

1. **AI ma być niezależne od stacku.** „AI features (FR-011, FR-013) are LLM API calls that work on any stack; no framework-specific AI integration is needed.” — `context/foundation/tech-stack.md:24`
2. **Przewidywana wymiana klienta LLM.** Pre-mortem infrastruktury zakłada, że parsowanie będzie potrzebowało „a heavier LLM client library with a streaming parser” (Claude, nie Workers AI) — `context/foundation/infrastructure.md:56`
3. **Parser to adapter, nie wiedza domenowa.** Destylacja: „Parser AI jako **adapter** (Workers AI, JSON schema, fuzzy match nazw…)” / „sam model LLM nie jest wiedzą domenową” — `context/domain/01-domain-distillation.md:231`

Dla kontrastu: **Supabase jest zablokowany** jako auth + Postgres + RLS (`tech-stack.md:24`, PRD FR-001). Cloudflare jako platforma jest rekomendacją z kosztem migracji „zero adapter changes” (`infrastructure.md:17`). Te dwa vendorzy są *wyborem*, nie obietnicą wymienialności.

---

## Krok 1 — IDENTYFIKACJA przeciekających zależności

Kandydaci zewnętrzni z manifestu + runtime, ocenieni sygnałami: (i) ten sam pakiet w wielu warstwach, (ii) zduplikowana rekonstrukcja typu biblioteki, (iii) typ biblioteki w sygnaturze „domenowej” albo na wire, (iv) SDK po obu stronach klient/serwer.

### L1 — Workers AI (`Ai` / `cloudflare:workers` / `@cf/meta/…`)

Nie ma wpisu w `package.json`. Kod „zna” binding, globalny typ `Ai` i kształt `{ response?: string }`.

| Plik:linia | Co wie |
| --- | --- |
| `wrangler.jsonc:15-18` | Binding `"ai": { "binding": "AI", "remote": true }` |
| `worker-configuration.d.ts:5` | `AI: Ai` na `Env` |
| `worker-configuration.d.ts:4953-4957` | `AiTextGenerationOutput = { response?: string; … }` |
| `worker-configuration.d.ts:10611` | Model `"@cf/meta/llama-3.1-8b-instruct-fp8"` |
| `worker-configuration.d.ts:10721`, `:10772-10776` | `Ai.run` → `postProcessedOutputs` |
| `src/env.d.ts:9` | Komentarz: importować `cloudflare:workers`, używać `env.AI` |
| `src/pages/api/check-in/parse.ts:2` | `import { env } from "cloudflare:workers"` |
| `src/pages/api/check-in/parse.ts:71` | `parseCheckInSentence(env.AI, …)` |
| `src/lib/goals/ai-checkin/parse-checkin.ts:4` | `PARSE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8"` |
| `src/lib/goals/ai-checkin/parse-checkin.ts:49-59` | Rekonstrukcja `{ response?: unknown }` → string |
| `src/lib/goals/ai-checkin/parse-checkin.ts:78-92` | Sygnatura `ai: Ai`; `ai.run(PARSE_MODEL, { messages, response_format, temperature, max_tokens })` |
| `src/lib/goals/ai-checkin/parse-checkin.test.ts:10`, `:52` | `as unknown as Ai` |
| `src/lib/goals/ai-checkin/parse-checkin.test.ts:15-16` | Fixture `{ response: JSON.stringify(…) }` |
| `src/test/vitest-mocks.ts:14-19` | `vi.mock("cloudflare:workers", { env: { AI: { run } } })` |
| `src/pages/api/check-in/parse.test.ts:3`, `:40`, `:74`, `:95`, `:109`, `:120-122` | `mockAiRun`; asercje na `{ response: … }` |

UI **nie importuje** `Ai`, ale **duplikuje** DTO parsera (kształt już domenowy, skopiowany ręcznie):

| Plik:linia | Co wie |
| --- | --- |
| `src/lib/goals/ai-checkin/parse-checkin.ts:6-16` | `ParsedProposal`, `UnrecognizedEntry` |
| `src/components/goals/AiCheckInTab.tsx:13-23` | Te same interfejsy, drugi raz |
| `src/components/goals/AiCheckInTab.tsx:93-99` | Inline typ JSON z `/parse` (`proposals`, `unrecognized`) |
| `src/lib/goals/ai-checkin/nl-input-validation.ts:1` | `MAX_CHECKIN_TEXT_LENGTH = 500` |
| `src/components/goals/AiCheckInTab.tsx:6` | `MAX_TEXT_LENGTH = 500` (kopia FR-032) |
| `src/lib/goals/ai-checkin/goal-name-match.ts:1-3` | `ActiveGoal` — trzecia kopia `{ id, name }` (też `parse-checkin.ts:18-21`) |

**Warstwy:** API + helper „serwisowy” (sygnatura `Ai`) + testy + globalne typy CF (widoczne także dla wysp React przez `include: **/*`). Binding nie jest w bundlu klienta *dziś*, bo wyspy nie importują `parse-checkin.ts` — ale typ `Ai` jest w jednostce kompilacji klienta.

### L2 — `@supabase/supabase-js` + `@supabase/ssr` + wygenerowany `Database`

Pakiet jest *wybranym* persistence/auth. Przeciek: typy biblioteki i wiersze tabeli jako kontrakt „domeny” i wire.

**Bezpośredni import pakietu:**

| Plik:linia | Import |
| --- | --- |
| `src/lib/supabase.ts:1-2` | `createServerClient`, `parseCookieHeader` z `@supabase/ssr`; `SupabaseClient` z `@supabase/supabase-js` |
| `src/lib/supabase.ts:7` | `SavedSupabaseClient = SupabaseClient<Database>` — alias **ukrywa** pakiet przed `grep supabase-js` |
| `src/lib/goals/sync-saved-amount.ts:1` | `SupabaseClient` |
| `src/lib/auth-redirect.ts:2` | `User` |
| `src/lib/auth-confirm.test.ts:2` | `User` |
| `src/pages/auth/confirm.ts:2` | `EmailOtpType` |
| `src/test/api-route.ts:2` | `User` |
| `src/env.d.ts:3` | `App.Locals.user: User \| null` |

**Klient / query builder** (warstwa API + SSR + helpery; nie React): `src/middleware.ts:2,9,16`; `src/pages/dashboard.astro:10`; `src/pages/goals/archive.astro:4,14-21`; `src/lib/goals/detail-page.ts:2`; `src/lib/goals/edit-page.ts:2`; wszystkie handlery pod `src/pages/api/{auth,check-in,goals,assets,liabilities,profile}/` wołające `getSupabase`; `src/lib/goals/ai-checkin/rate-limit.ts:1,7`.

**Typ wiersza tabeli jako typ domenowy:**

| Plik:linia | Użycie |
| --- | --- |
| `src/lib/goals/projection.ts:1-8` | `GoalMetricsInput = Pick<GoalRow, …>` — matematyka projekcji czyta schemat DB |
| `src/lib/goals/validation.ts:1,3,78-92` | `formatGoalRow(row: SavingsGoalRow)` — wiersz DB na JSON API |
| `src/lib/net-worth/compute.ts:1,3,11` | `getStalestAsset(assets: AssetRow[])` |
| `src/lib/net-worth/validation.ts:1-4` | `AssetRow` / `LiabilityRow` |
| `src/lib/goals/sync-saved-amount.ts:2,4,7` | `recalcSavedAmount(supabase: SupabaseClient<Database>, …)` |
| `src/lib/goals/detail-page.ts:4,6-7` | `GoalRow`, `PaymentRow` |
| `src/lib/goals/edit-page.ts:3,5` | `GoalRow` |
| `src/env.d.ts:4` | `profile: Database[…]["profiles"]["Row"]` |

Wyspy React **nie** importują `@supabase/*` (grep w `src/components` pusty). SDK nie jest po stronie przeglądarki; jest po stronie SSR **i** API.

### L3 — `zod`

Tylko `src/lib/goals/ai-checkin/parse-schema.ts:1` (oraz `packages/code-reviewer/`, poza produktem). To **granica** walidacji JSON, nie przeciek wielowarstwowy.

### L4 — `canvas-confetti`

Tylko `src/components/goals/CelebrationModal.tsx:2,20`. Jedna warstwa UI. FR-010 chce celebracji; biblioteka jest generic (`01-domain-distillation.md` pkt 24/generic).

### L5 — `@astrojs/cloudflare` / workerd

`astro.config` + `wrangler.jsonc`. Dokumenty **świadomie** zamykają platformę (`infrastructure.md:17`). Wymiana to zmiana adaptera deploy, nie ACL domeny check-inu.

---

## Krok 2 — KLASYFIKACJA i wybór #1

Osie: **(a)** liczba warstw/plików, **(b)** ryzyko/koszt wymiany *dziś*, **(c)** czy dokumenty deklarują wymienialność (rozjazd intencja-vs-kod).

| ID | (a) Zasięg | (b) Koszt wymiany dziś | (c) Intencja | Werdykt |
| --- | --- | --- | --- | --- |
| **L1 Workers AI** | API + „serwis” + 3 pliki testów + globalny `Ai` w całej kompilacji + wrangler | Średni zakres plików, **wysoki koszt semantyczny**: model ID, `ai.run`, `{ response }`, JSON mode, mock `cloudflare:workers` — wszystko poza adapterem | **Tak — wprost.** `tech-stack.md:24`; pre-mortem „heavier LLM client” `infrastructure.md:56`; destylacja „adapter” `01:231` | **#1** |
| **L2 Supabase** | Najwięcej plików (API, SSR, middleware, helpery, `App.Locals`) | Wymiana = przepisanie aplikacji. Alias `SavedSupabaseClient` **ukrywa** pakiet przed grepem | **Nie.** Stack i PRD zamykają Supabase jako auth+RLS | Kandydat #2 (repozytorium w planie 02, nie tu) |
| L3 Zod | 1 plik produktu | Niski | Walidacja strukturalna FR-036 — ma być na granicy | Zostaje w ACL jako parser JSON, nie jako przeciek |
| L4 confetti | 1 komponent | Niski | Celebracja jest core *momentem*, lib jest generic | Nie ruszać |
| L5 Cloudflare adapter | Konfiguracja runtime | Świadomy lock | `infrastructure.md:17` „zero adapter changes” | Poza ACL domeny |

### Wybór #1

**Workers AI — binding `env.AI`, globalny typ `Ai`, model `@cf/meta/llama-3.1-8b-instruct-fp8`.**

Dlaczego ten, a nie Supabase (więcej plików):

1. **Rozjazd intencja-vs-kod jest najmocniejszy.** Dokument stacku obiecuje „LLM API calls that work on any stack; no framework-specific AI integration”. Kod jest w 100% Workers-AI-specific: `import { env } from "cloudflare:workers"`, `ai: Ai`, `@cf/meta/…`, `response_format: { type: "json_object" }`.
2. **Sygnatura „domenowa” nosi typ vendora.** `parseCheckInSentence(ai: Ai, …)` (`parse-checkin.ts:78-80`) — helper, który mapuje zdanie na propozycje wpłat, wymaga Cloudflare `Ai`. To definicja przecieku przez granicę.
3. **Koszt wymiany jest nieproporcjonalny do liczby plików.** Zamiana na OpenAI / Anthropic / inny binding nie jest „podmianą URL”: trzeba przepisać `run`/`messages`/`{ response }`, testy, mock modułu `cloudflare:workers`, i mieć nadzieję, że API `parse.ts` i UI dalej rozumieją ten sam JSON. Pre-mortem już przewiduje tę wymianę (`infrastructure.md:56`).
4. **Supabase nie obiecuje wymienialności.** Plan 02 i tak wprowadza repozytorium agregatu — to osobna granica (persystencja celów), nie ACL parsera NL.
5. **UI już dostaje DTO, nie `Ai`.** Przeciek L1 jest *za* HTTP. To akurat ułatwia ACL: wire zostaje, znika vendor z helpera i handlera.

---

## Krok 3 — DIAGNOZA

### 3.1 Intencja (cytaty)

```24:24:context/foundation/tech-stack.md
  … AI features (FR-011, FR-013) are LLM API calls that work on any stack; no framework-specific AI integration is needed. …
```

```56:56:context/foundation/infrastructure.md
The team deployed Saved! … Three months in, the AI parsing feature needed a heavier LLM client library with a streaming parser. …
```

```231:231:context/domain/01-domain-distillation.md
| Parser AI jako **adapter** (Workers AI, JSON schema, fuzzy match nazw, rate-limit `ai_checkin_requests`) | **Supporting** (rdzenia) | … sam model LLM nie jest wiedzą domenową. …
```

Zarchiwizowany S-04 **przykleił** produkt do vendora wprost: „Model: `@cf/meta/llama-3.1-8b-instruct` via Workers AI binding” / „Access Workers AI in Astro API routes via `context.locals.runtime.env.AI`” — `context/archive/2026-06-23-ai-checkin-safety/plan.md:50,58`. Kod poszedł jeszcze ciaśniej: inny sufiks modelu (`-fp8`) i `import { env } from "cloudflare:workers"` zamiast `locals.runtime.env.AI`.

### 3.2 Typ biblioteki w sygnaturze helpera

```4:4:src/lib/goals/ai-checkin/parse-checkin.ts
const PARSE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
```

```78:92:src/lib/goals/ai-checkin/parse-checkin.ts
export async function parseCheckInSentence(
  ai: Ai,
  text: string,
  activeGoals: ActiveGoal[],
): Promise<ParseSuccess | ParseFailure> {
  try {
    const result = await ai.run(PARSE_MODEL, {
      messages: [
        { role: "system", content: buildSystemPrompt(activeGoals.map((goal) => goal.name)) },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 512,
    });
```

`Ai` nie jest importowane. Jest **globalne** z `worker-configuration.d.ts`, wciągnięte przez `tsconfig.json:4` (`include: ["**/*"]`). Każda wyspa React *może* odwołać się do `Ai` i przejść `tsc`. To jest przeciek typu serwerowego do jednostki kompilacji klienta — groźniejszy niż aktualny bundel (dziś `parse-checkin.ts` nie jest importowany z `src/components/`).

Handler API jest kompozycją vendora, nie portu:

```2:2:src/pages/api/check-in/parse.ts
import { env } from "cloudflare:workers";
```

```71:71:src/pages/api/check-in/parse.ts
  const parseResult = await parseCheckInSentence(env.AI, textResult.text, activeGoals);
```

### 3.3 Zduplikowana rekonstrukcja kształtu Workers AI

Wygenerowany kontrakt bindingu (nie REST):

```4953:4957:worker-configuration.d.ts
type AiTextGenerationOutput = {
  response?: string;
  tool_calls?: AiTextGenerationToolLegacyOutput[] & AiTextGenerationToolOutput[];
  usage?: UsageTags;
};
```

Ręczna rekonstrukcja w helperze — bez importu typu vendora, ale z jego kształtem:

```49:59:src/lib/goals/ai-checkin/parse-checkin.ts
function extractResponseText(result: unknown): string | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }

  const response = (result as { response?: unknown }).response;
  if (typeof response !== "string" || !response.trim()) {
    return null;
  }

  return response.trim();
}
```

Ten sam kształt w testach (druga i trzecia kopia):

```9:16:src/lib/goals/ai-checkin/parse-checkin.test.ts
function aiWithResponse(response: unknown) {
  return { run: vi.fn().mockResolvedValue(response) } as unknown as Ai;
}
// …
    const ai = aiWithResponse({
      response: JSON.stringify({
```

```109:122:src/pages/api/check-in/parse.test.ts
    mockAiRun.mockResolvedValue({ response: "not json" });
    // …
    mockAiRun.mockResolvedValue({
      response: JSON.stringify({ payments: [{ goal_name: "Wakacje", amount: 500 }] }),
    });
```

```14:19:src/test/vitest-mocks.ts
vi.mock("cloudflare:workers", () => ({
  env: {
    AI: {
      run: hoistedAiRun,
    },
  },
}));
```

Gdyby `response` było obiektem (JSON Mode ze schemą — dokumentacja CF, patrz krok 5.3), `extractResponseText` zwróci `null` → cały parse to `invalid_response` → HTTP 503. Ta decyzja żyje w helperze i w dwóch zestawach testów, nie w jednym adapterze.

### 3.4 Duplikacja DTO po stronie UI (nie surowy `Ai`, ale kopia kontraktu parsera)

```6:16:src/lib/goals/ai-checkin/parse-checkin.ts
export interface ParsedProposal {
  goalId: string;
  goalName: string;
  amount: number;
  rawGoalName: string;
}

export interface UnrecognizedEntry {
  rawGoalName: string;
  amount: number;
}
```

```13:23:src/components/goals/AiCheckInTab.tsx
interface ParsedProposal {
  goalId: string;
  goalName: string;
  amount: number;
  rawGoalName: string;
}

interface UnrecognizedEntry {
  rawGoalName: string;
  amount: number;
}
```

Wire `/api/check-in/parse` **już** jest domenowy (`proposals` / `unrecognized`, `parse.ts:83-88`). UI nie dostaje `{ response }`. Problem: dwa źródła prawdy dla tego samego VO i zduplikowany limit 500 znaków (`nl-input-validation.ts:1` vs `AiCheckInTab.tsx:6`).

### 3.5 Co ACL **nie** musi naprawiać w tym planie

- Tabela `ai_checkin_requests` i `rate-limit.ts` — to limit produktu (FR-034), nie kształt LLM. Zostaje przy porcie aplikacyjnym / repozytorium; nie wciąga `Ai`.
- `matchGoalName` — wiedza domenowa (nazwy celów), nie vendor.
- `parse-schema.ts` (Zod) — zostaje jako walidacja strukturalna na granicy (FR-036), wołana **po** adapterze, na `unknown`.

---

## Krok 4 — PROJEKT ACL

Jedyna wiedza o Workers AI żyje w adapterze. Domena zna **zdanie, cele, propozycje wpłat**. Handler zna **port**. UI zna **gotowe VO**.

Ścieżki (spójne z planem 02: `src/domain/…`):

- `src/domain/check-in-parse/` — VO + port
- `src/infrastructure/ai/workers-ai/` — adapter
- kompozycja: cienki moduł `src/infrastructure/ai/create-parser.ts` (jedyny import `cloudflare:workers` w `src/`)

### 4.1 Value objects (domena — zero `Ai`, zero `@cf/`)

```ts
// src/domain/check-in-parse/parsed-check-in.ts

export interface ActiveGoalRef {
  id: string;
  name: string;
}

export class MoneyAmount {
  private constructor(readonly value: number) {}
  static fromPositive(n: number): MoneyAmount | null {
    return n > 0 && Number.isFinite(n) ? new MoneyAmount(n) : null;
  }
}

export class ProposedAllocation {
  constructor(
    readonly goalId: string,
    readonly goalName: string,
    readonly amount: MoneyAmount,
    readonly rawGoalName: string,
  ) {}
}

export class UnrecognizedMention {
  constructor(
    readonly rawGoalName: string,
    readonly amount: MoneyAmount,
  ) {}
}

export class ParsedCheckIn {
  constructor(
    readonly proposals: readonly ProposedAllocation[],
    readonly unrecognized: readonly UnrecognizedMention[],
  ) {}

  toReviewDto() {
    return {
      proposals: this.proposals.map((p) => ({
        goalId: p.goalId,
        goalName: p.goalName,
        amount: p.amount.value,
        rawGoalName: p.rawGoalName,
      })),
      unrecognized: this.unrecognized.map((u) => ({
        rawGoalName: u.rawGoalName,
        amount: u.amount.value,
      })),
    };
  }
}

export type CheckInParseFailureReason = "model_unavailable" | "invalid_response";

export type CheckInParseOutcome =
  | { ok: true; parsed: ParsedCheckIn }
  | { ok: false; reason: CheckInParseFailureReason };
```

Operacje domenowe (nie vendor):

```ts
// src/domain/check-in-parse/from-model-json.ts
// Wejście: unknown (już po adapterze). Zod zostaje tutaj albo w cienkim module granicy.
// Polityka FR-035 (exclude niedodatnich / niedopasowanych) — TU, nie w Workers AI.
function parsedCheckInFromModelJson(
  raw: unknown,
  activeGoals: readonly ActiveGoalRef[],
  match: typeof matchGoalName,
): CheckInParseOutcome
```

Pseudokod:

```
parsedCheckInFromModelJson(raw, goals, match):
  schema = parseAiResponse(raw)          // FR-036: zły JSON → invalid_response
  if !schema.ok: return failure(invalid_response)
  proposals, unrecognized = []
  for each payment in schema.data.payments:
    amount = MoneyAmount.fromPositive(payment.amount)
    if amount is null: continue          // FR-035 exclude, nie fail-closed całości
    m = match(payment.goal_name, goals)
    if m.matched: proposals += ProposedAllocation(...)
    else: unrecognized += UnrecognizedMention(...)
  return success(ParsedCheckIn(proposals, unrecognized))
```

(Dziś `amount: 0` w **dowolnym** elemencie zwala cały payload — `parse-schema.ts:7` + `parse-schema.test.ts:22`. ACL **rozstrzyga** to w domenie, nie w API: Zod na granicy może nadal wymagać liczby; `fromPositive` wyklucza niedodatnie z review. Szczegół FR-035 vs FR-036 był w destylacji jako rozjazd #5; decyzja kodowana w `from-model-json`, nie w `parse.ts`.)

### 4.2 Port (wąski)

```ts
// src/domain/check-in-parse/natural-language-check-in-parser.ts

export interface CheckInParseRequest {
  text: string;                       // już po validateCheckInText (FR-032/033)
  activeGoals: readonly ActiveGoalRef[];
}

export interface NaturalLanguageCheckInParser {
  parse(request: CheckInParseRequest): Promise<CheckInParseOutcome>;
}
```

Reszta aplikacji (`parse.ts`, testy handlera, UI) zna **tylko** ten interfejs i `ParsedCheckIn.toReviewDto()`.

### 4.3 Adapter (jedyny znawca Workers AI)

```ts
// src/infrastructure/ai/workers-ai/workers-ai-check-in-parser.ts

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8"; // decyzja vendora — TU

export class WorkersAiCheckInParser implements NaturalLanguageCheckInParser {
  constructor(private readonly ai: Ai) {}

  async parse(request: CheckInParseRequest): Promise<CheckInParseOutcome> {
    let rawOutput: unknown;
    try {
      rawOutput = await this.ai.run(MODEL, {
        messages: [
          { role: "system", content: buildSystemPrompt(request.activeGoals.map(g => g.name)) },
          { role: "user", content: request.text },
        ],
        response_format: { type: "json_object" }, // patrz 5.3 — decyzja ACL
        temperature: 0.2,
        max_tokens: 512,
        // stream: nigdy true — run() wtedy zwraca ReadableStream (worker-configuration.d.ts:10764-10770)
      });
    } catch {
      return { ok: false, reason: "model_unavailable" };
    }

    const payload = workersAiOutputToJsonUnknown(rawOutput); // jedyne mapowanie {response}
    if (payload === null) return { ok: false, reason: "invalid_response" };
    return parsedCheckInFromModelJson(payload, request.activeGoals, matchGoalName);
  }
}

function workersAiOutputToJsonUnknown(result: unknown): unknown | null {
  // Kontrakt BINDINGU (nie REST): AiTextGenerationOutput.response?: string
  // JSON Mode ze schemą może oddać obiekt w `response` — normalizować oba.
  // REST { result: { response } } — NIE obsługiwać tutaj, chyba że powstanie RestAiCheckInParser.
}
```

Kompozycja (jedyny `import { env } from "cloudflare:workers"`):

```ts
// src/infrastructure/ai/create-parser.ts
import { env } from "cloudflare:workers";
import { WorkersAiCheckInParser } from "./workers-ai/workers-ai-check-in-parser";
import type { NaturalLanguageCheckInParser } from "@/domain/check-in-parse/natural-language-check-in-parser";

export function createCheckInParser(): NaturalLanguageCheckInParser {
  return new WorkersAiCheckInParser(env.AI);
}
```

Handler po zmianie (pseudokod, nie implementacja):

```
POST /api/check-in/parse:
  auth, supabase, validateCheckInText, rateLimit, load activeGoals   // bez Ai
  recordParseAttempt
  outcome = parser.parse({ text, activeGoals })
  if !outcome.ok → 503 AI_UNAVAILABLE
  return json { success, ...outcome.parsed.toReviewDto(), rateLimitRemaining }
```

`parse.ts` **nie** importuje `cloudflare:workers`. Test handlera mockuje **port**, nie `Ai.run`.

### 4.4 Co zostaje poza ACL (świadomie)

| Byt | Gdzie | Dlaczego |
| --- | --- | --- |
| `validateCheckInText` | domena / lib | FR-032/033 — przed modelem, niezależne od vendora |
| `checkRateLimit` / `ai_checkin_requests` | aplikacja + DB | FR-034; nie jest kształtem LLM |
| `matchGoalName` | domena | matching nazw celów |
| Zod `AiParseResponseSchema` | granica JSON | FR-036; wejście `unknown` |
| `wrangler.jsonc` `ai.binding` | infra | konfiguracja runtime; nie `src/` |
| `worker-configuration.d.ts` | wygenerowane | zostaje; **nie** importowane z `src/domain/` |

---

## Krok 5 — Dowód izolacji + before/after

### 5.1 Wymiana biblioteki (Workers AI → inny LLM) dotyka tylko adaptera

| Powierzchnia | Przy wymianie modelu/SDK |
| --- | --- |
| Tabele (`savings_goals`, `goal_payments`, `ai_checkin_requests`) | **Nie.** Rate-limit liczy próby, nie tokeny vendora |
| HTTP `/api/check-in/parse` (`proposals`, `unrecognized`, kody `AI_UNAVAILABLE` / `RATE_LIMITED`) | **Nie.** Handler woła port |
| HTTP `/api/check-in` (zapis po review) | **Nie.** Już dziś nie woła AI |
| UI `AiCheckInTab` | **Nie.** Dostaje DTO z `toReviewDto()` |
| `NaturalLanguageCheckInParser` / `ParsedCheckIn` | **Nie.** |
| `WorkersAiCheckInParser` + `workersAiOutputToJsonUnknown` + `PARSE_MODEL` | **Tak** — nowy adapter np. `OpenAiCheckInParser` |
| `create-parser.ts` + `wrangler.jsonc` (binding) | **Tak** (składanie + ewentualnie usunięcie bindingu AI) |
| Testy jednostkowe adaptera | **Tak** (nowy kształt odpowiedzi) |
| Testy handlera | **Nie**, jeśli mockują port |

### 5.2 Before / after zduplikowanych miejsc

| Miejsce | Dziś | Po |
| --- | --- | --- |
| `parse-checkin.ts:78` `ai: Ai` | Helper domenowy wymaga Cloudflare | Funkcja znika; port `parse(request)` |
| `parse.ts:2` `cloudflare:workers` | Handler zna binding | `createCheckInParser()` / wstrzyknięty port |
| `parse-checkin.ts:49-59` + 2 testy `{ response }` | Trzy rekonstrukcje kształtu vendora | Jedna: `workersAiOutputToJsonUnknown` |
| `PARSE_MODEL` w helperze | Model ID w warstwie parse | Stała w adapterze |
| `AiCheckInTab.tsx:13-23` | Druga kopia `ParsedProposal` | `import type` z domeny / `toReviewDto()` |
| `AiCheckInTab.tsx:6` vs `nl-input-validation.ts:1` | Dwa limity 500 | Jeden eksport domenowy; UI importuje stałą albo ufa 400 z API |
| `vitest-mocks.ts:14-19` | Globalny mock `cloudflare:workers` dla **wszystkich** testów | Mock bindingu tylko przy teście adaptera; handler dostaje fake port |
| UI recenzji | Już nie dostaje `{ response }` — zostaje tak | Jawne: `json.proposals` pochodzi z VO, nie z `AiTextGenerationOutput` |

UI **dziś** nie renderuje surowego obiektu biblioteki. After to utrwalenie: jedyne JSON-y, które widzi wyspa, to `ParsedCheckIn.toReviewDto()`.

### 5.3 Otwarte pytania kontraktu — rozstrzygnięte z dokumentacji CF, zakodowane w ACL

Źródła: [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings), [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode), [REST llama-3.1-8b-instruct](https://developers.cloudflare.com/workers-ai/get-started/rest-api), typy `worker-configuration.d.ts:4915-4957`, `:10764-10776`.

| Pytanie | Fakt z kontraktu | Decyzja | Gdzie kodować |
| --- | --- | --- | --- |
| Gdzie jest tekst modelu przy **bindingu** `ai.run`? | `AiTextGenerationOutput.response?: string` (`worker-configuration.d.ts:4953-4957`). Docs bindingu: `env.AI.run(model, { messages })` zwraca JSON z polem tekstu | Czytać `result.response`, nie owijać w `{ result: { response } }` | `workersAiOutputToJsonUnknown` |
| REST vs binding | REST: `{ success, result: { response: "…" } }` | Ten produkt woła binding. REST-owy wrapper **nie** wchodzi do adaptera bindingu. Gdyby powstał klient HTTP, nowy adapter | Nowy plik adaptera, nie `parse.ts` |
| JSON Mode: string czy obiekt? | Docs JSON Mode: przy `json_schema` przykładowe `response` to **obiekt**. Typ wygenerowany nadal mówi `response?: string`. Kod dziś wymaga `typeof response === "string"` (`parse-checkin.ts:55`) — **pęknie** na obiekcie | Normalizować: string → `JSON.parse` (+ fence); object → użyć wprost jako `unknown` dla Zod. Nie zakładać tylko stringa | Adapter, nie API |
| `type: "json_object"` bez `json_schema` | Docs JSON Mode wymagają `json_schema` dla trybu schematu; `AiTextGenerationResponseFormat` ma `type: string` + opcjonalne `json_schema` (`worker-configuration.d.ts:4915-4918`) | Zostawić `json_object` bez schematu (obecne zachowanie) **albo** dodać `json_schema` płatności w adapterze. Schemat JSON modelu ≠ Zod domeny: Zod i tak waliduje `unknown`. Nie wystawiać schematu CF na wire HTTP | Adapter |
| `stream: true` | `run` ze `stream: true` → `Promise<ReadableStream>` (`:10764-10770`) | **Zakaz streamu** w parserze check-inu. Pre-mortem (`infrastructure.md:56`) straszy streaming parserem przy *innym* kliencie — to będzie inny adapter, ten zostaje nie-streamujący (512 tokenów mieści się w pamięci) | Adapter (nie podawać `stream`) |
| Który model? | Kod: `@cf/meta/llama-3.1-8b-instruct-fp8` (`parse-checkin.ts:4`, katalog `:10611`). Plan S-04: `@cf/meta/llama-3.1-8b-instruct` **bez** `-fp8` (`plan.md:50`) | Pin obecnego `-fp8` w stałej adaptera. Zmiana modelu = diff w jednym pliku | Adapter |
| `messages` vs `prompt` | Oba w `AiTextGenerationInput` (`:4919-4932`) | Zostawić `messages` (system + user) — prompt domenowy z listą celów | Adapter (treść system promptu może być współdzielona jako czysta funkcja domenowa *bez* `Ai`) |
| `max_tokens` / `temperature` | Gałki vendora, nie PRD | 512 / 0.2 zostają w adapterze | Adapter |
| Brak bindingu `AI` | Research S-04: brak jawnego checka; `ai.run` rzuca → `ai_error` → 503 | `catch` w adapterze → `model_unavailable`. Handler mapuje na `AI_UNAVAILABLE`. Nie sprawdzać `env.AI` w API | Adapter + mapowanie HTTP |

Żadnej z tych decyzji nie umieszczać w `src/pages/api/check-in/parse.ts`.

---

## Krok 6 — Weryfikacja i plan faz

### 6.1 Kryterium sukcesu (grep)

Po refaktorze, w `src/` (poza katalogiem ACL/adaptera):

```
rg -n "cloudflare:workers|@cf/meta|: Ai\\b|as Ai\\b|env\\.AI|AiTextGeneration" src
```

zwraca **wyłącznie**:

- `src/infrastructure/ai/create-parser.ts`
- `src/infrastructure/ai/workers-ai/**`
- (opcjonalnie) testy **adaptera** w tym samym drzewie

`wrangler.jsonc` i `worker-configuration.d.ts` zostają poza `src/` — to infra, nie przeciek warstw aplikacji.

| Plik | Dziś zna vendora? | Po |
| --- | --- | --- |
| `src/pages/api/check-in/parse.ts` | tak (`cloudflare:workers`, `env.AI`) | **nie** — port |
| `src/lib/goals/ai-checkin/parse-checkin.ts` | tak (`Ai`, model, `ai.run`, `{ response }`) | plik znika albo zostaje czystym `from-model-json` bez `Ai` |
| `src/lib/goals/ai-checkin/parse-checkin.test.ts` | tak (`as Ai`, `{ response }`) | testy domeny na `unknown` JSON; testy `{ response }` tylko przy adapterze |
| `src/pages/api/check-in/parse.test.ts` | tak (`mockAiRun`, `{ response }`) | fake `NaturalLanguageCheckInParser` |
| `src/test/vitest-mocks.ts` | tak (globalny mock modułu) | mock `cloudflare:workers` tylko jeśli test adaptera go potrzebuje |
| `src/env.d.ts:9` | komentarz-instrukcja przecieku | usunąć / zastąpić „parser z createCheckInParser” |
| `src/components/goals/AiCheckInTab.tsx` | kopia DTO (nie `Ai`) | import DTO; **nadal nie** zna vendora |
| `src/infrastructure/ai/**` | nie istnieje | **jedyny** znawca |
| `wrangler.jsonc` | binding | zostaje (infra) |

Grep `@supabase/supabase-js` **nie** jest kryterium tego planu (L2 / plan 02).

### 6.2 Fazy (konwencja `/10x-plan`)

Vitest jest podłogą (`test-plan.md:15-18`, `:32-35`). Fazy 1–2 test-first (`/10x-tdd`). Faza 0 — szkielet. Faza 4 — UI poza `npm test` (wyspy). Nie ruszać agregatu z planu 02.

#### Phase 0: Katalogi ACL

**Intent**: `src/domain/check-in-parse/` + `src/infrastructure/ai/workers-ai/` bez podpinania handlera.

**Success (automated):** `tsc` / lint czyste; zero importów z API.

#### Phase 1: VO + `from-model-json` + port

**Intent**: `ParsedCheckIn`, `NaturalLanguageCheckInParser`, mapowanie `unknown` → VO (Zod + `matchGoalName` + FR-035 exclude). Zero `Ai`.

**Contract**: sygnatury z §4.1–4.2.

**Success (automated):**
- Unit: legalny JSON → propozycje + unrecognized
- Unit: śmieć → `invalid_response`
- Unit: kwota `≤ 0` w jednym elemencie **nie** zwala całości (nowa polityka FR-035 w domenie; zaktualizować `parse-schema.test.ts:22` albo przenieść asercję)
- `rg "from \"cloudflare:workers\"" src/domain` puste

**Success (manual):** brak (jeszcze nie podpięte).

#### Phase 2: Adapter Workers AI

**Intent**: `WorkersAiCheckInParser` + `workersAiOutputToJsonUnknown`. Pin kontraktu bindingu.

**Success (automated):**
- `{ response: "<json string>" }` → VO
- `{ response: { payments: […] } }` (obiekt) → VO — decyzja §5.3
- `{ response: "not json" }` → `invalid_response`
- `run` throw → `model_unavailable`
- `stream` nie jest przekazywane
- `PARSE_MODEL` tylko w adapterze

**Success (manual):** brak.

#### Phase 3: Handler na porcie

**Intent**: `parse.ts` woła `NaturalLanguageCheckInParser`; usunąć `import { env } from "cloudflare:workers"` z API. `create-parser.ts` jedynym importem modułu. Testy `parse.test.ts` mockują port, nie `mockAiRun`.

**Success (automated):**
- Istniejące przypadki 401 / 400 / 429 / 503 / 200 bez zapisu `goal_payments` nadal zielone
- `rg "cloudflare:workers" src/pages` puste
- `rg "env\\.AI|as Ai|: Ai" src/lib src/pages` puste
- Kryterium grep §6.1

**Success (manual):** `npm run dev` — parse AI na `/dashboard` (wymaga `wrangler login`); fallback ręczny przy 503.

#### Phase 4: UI bez kopii DTO

**Intent**: `AiCheckInTab` importuje typ review z domeny; jedna stała 500 znaków.

**Success (automated):** lint; brak drugiego `interface ParsedProposal` w `src/components`.

**Success (manual):** ścieżka AI: zdanie → review → zapis; nierozpoznana nazwa; przełącz na ręczny przy 503. Desktop. Nie blokuje faz 1–3.

### 6.3 Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 0: Katalogi ACL

#### Automated

- [ ] 0.1 Szkielet `src/domain/check-in-parse/` i `src/infrastructure/ai/` bez importów z API
- [ ] 0.2 Lint / typecheck czyste na pustym szkielecie

### Phase 1: VO + port

#### Automated

- [ ] 1.1 Unit: JSON modelu → `ParsedCheckIn` (match + unrecognized)
- [ ] 1.2 Unit: śmieć → `invalid_response`
- [ ] 1.3 Unit: niedodatnia kwota wykluczona z review (FR-035), nie 503 całości
- [ ] 1.4 `src/domain` bez `cloudflare:workers` / `Ai`

### Phase 2: Adapter Workers AI

#### Automated

- [ ] 2.1 Adapter: string `response` → VO
- [ ] 2.2 Adapter: obiekt `response` → VO
- [ ] 2.3 Adapter: throw → `model_unavailable`; brak `stream`
- [ ] 2.4 Model ID tylko w adapterze

### Phase 3: Handler na porcie

#### Automated

- [ ] 3.1 `parse.ts` bez `cloudflare:workers`; testy handlera na fake porcie
- [ ] 3.2 Regresja 401/400/429/503/200 + brak zapisu `goal_payments` na parse
- [ ] 3.3 Grep §6.1 zielony na `src/pages` i `src/lib`

#### Manual

- [ ] 3.4 Dev: AI parse + fallback ręczny przy niedostępności

### Phase 4: UI DTO

#### Automated

- [ ] 4.1 Jedno źródło typów review / stałej 500; brak kopii w `AiCheckInTab`

#### Manual

- [ ] 4.2 E2E ręczne: AI review, unrecognized, 503 → manual, zapis check-inu

---

## Metoda i ograniczenia

- Odkrycie: PRD, tech-stack, infrastructure, README, destylacja 01, plan 02, S-04 archive, `package.json`, `wrangler.jsonc`, `src/lib/goals/ai-checkin`, handler parse, `AiCheckInTab`, `worker-configuration.d.ts`, grep `@supabase/*` / `zod` / `canvas-confetti`.
- Wybór #1 nie był założony: L2 ma więcej plików, ale dokumenty **zamykają** Supabase; L1 łamie jawną obietnicę wymienialności AI.
- Dokumentacja Workers AI (binding, JSON Mode, REST vs `AiTextGenerationOutput`) użyta do decyzji w §5.3 — wszystkie zakodowane w adapterze.
- Ten dokument nie zmienia kodu produkcyjnego.
- Cytaty `plik:linia` zweryfikowane względem drzewa z 2026-09-14.
