# Saved!

Saved! pomaga śledzić kilka celów oszczędnościowych naraz przy minimalnej tarce: raz w miesiącu wpisujesz jedno zdanie w naturalnym języku, a aplikacja zamienia je na wpłaty, postęp i realistyczną projekcję. Panel wartości netto (aktywa minus pasywa) jest motywacyjnym kontekstem — „coś się zdziałało w życiu” — a nie rdzeniem produktu. Jeśli parsowanie AI nie zadziała, zawsze możesz zrobić check-in ręcznie.

## Stack

- [Astro](https://astro.build/) 6 — SSR (`output: "server"`)
- [React](https://react.dev/) 19 — interaktywne wyspy
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Supabase](https://supabase.com/) — auth (OTP / magic link) i baza
- [Cloudflare Workers](https://workers.cloudflare.com/) — runtime i deploy (adapter `@astrojs/cloudflare`)

## Wymagania

- Node.js **22.14.0** (zgodnie z `.nvmrc`)
- npm (w zestawie z Node)
- [Docker](https://www.docker.com/) — lokalny stack Supabase (`npx supabase start`; pierwsze uruchomienie pobiera obrazy)

## Quick start

Katalog `supabase/` jest już w repozytorium — **nie** uruchamiaj `npx supabase init`.

1. Sklonuj to repozytorium i wejdź do katalogu projektu:

```bash
git clone https://github.com/kapaminska/saved.git
cd saved
```

2. Zainstaluj zależności:

```bash
npm install
```

3. Skopiuj zmienne środowiskowe (Astro/CI czyta `.env`; lokalny Cloudflare/`wrangler` czyta `.dev.vars`):

```bash
cp .env.example .env
cp .env.example .dev.vars
```

4. Uruchom lokalny Supabase (wymaga Dockera):

```bash
npx supabase start
```

5. Wklej dane z wyjścia CLI do **obu** plików (`.env` i `.dev.vars`):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key z wyjścia CLI>
```

6. Uruchom serwer deweloperski:

```bash
npm run dev
```

Aplikacja jest dostępna pod adresem podanym w terminalu (zazwyczaj `http://localhost:4321`). Zatrzymanie stacku Supabase: `npx supabase stop`.

### Hostowany projekt Supabase (opcjonalnie)

Zamiast lokalnego stacku możesz wstawić URL i klucz `anon` z dashboardu (Settings → API) do `.env` i `.dev.vars`.

## Logowanie lokalne

Wejdź na `/auth/signin` i podaj e-mail. Aplikacja wysyła **kod OTP** (nie formularz hasła). W lokalnym Supabase maile nie wychodzą na zewnątrz — otwórz [Inbucket](http://127.0.0.1:54324) i skopiuj kod z wiadomości.

[Supabase Studio](http://localhost:54323) pokazuje lokalną bazę i użytkowników.

## Check-in z AI

Parsowanie zdania check-inu idzie przez binding Workers AI (`wrangler.jsonc`, `ai.remote`). W `npm run dev` potrzebne jest zalogowanie do Cloudflare:

```bash
npx wrangler login
```

Bez logowania check-in **ręczny** nadal działa — AI nigdy nie blokuje użytkownika.

## Skrypty

- `npm run dev` — serwer deweloperski (runtime Cloudflare workerd)
- `npm run build` — build produkcyjny
- `npm run preview` — podgląd buildu
- `npm run lint` — ESLint (reguły z sprawdzaniem typów)
- `npm run format` — Prettier
- `npm run deploy` — `astro build` + `wrangler deploy`

## Deploy

Aplikacja wdraża się na Cloudflare Workers.

```bash
npm run deploy
```

Ustaw sekrety `SUPABASE_URL` i `SUPABASE_KEY` w dashboardzie Cloudflare albo przez `npx wrangler secret put`.

CI (GitHub Actions) na gałęzi `main` uruchamia lint i build (push i PR). Do kroku build potrzebne są sekrety repozytorium `SUPABASE_URL` i `SUPABASE_KEY`. Deploy z CI wymaga dodatkowo `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID`.

## Licencja

MIT
