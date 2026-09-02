# Product README Implementation Plan

## Overview

Replace the leftover 10x Astro Starter README with a Polish product README for Saved! so a 10xDevs reviewer can understand the app and run it locally (Node, Docker/Supabase, `.dev.vars`, OTP via Inbucket).

## Current State Analysis

`README.md` still describes the starter: clone URL `10x-astro-starter`, email/password auth routes, “no database tables required”, and embeds `public/template.png`.

### Key Discoveries:

- Auth is magic-link/OTP (`src/pages/api/auth/send-otp.ts`, `MagicLinkForm`), not email+password. Local mail is Inbucket (`supabase/config.toml` `[inbucket]` port `54324`).
- Cloudflare local secrets live in `.dev.vars` (not only `.env`); both need `SUPABASE_URL` / `SUPABASE_KEY`.
- AI check-in uses Wrangler remote AI binding (`wrangler.jsonc` `ai.remote`); `wrangler login` is required for NL parse in `npm run dev`.
- `npx supabase init` is already done — `supabase/` exists. First-time docs must say `npx supabase start`, not init.
- CI (`.github/workflows/ci.yml`) is lint + build + deploy; README should mention repo secrets, not invent new pipeline.

## Desired End State

Root `README.md` is titled Saved!, written in Polish, and covers: what the product is, stack, prerequisites, clone-this-repo (not the starter), `npm install`, `.env` + `.dev.vars`, `npx supabase start`, Inbucket for OTP, `npm run dev`, optional `wrangler login`, scripts, short deploy note. Starter clone instructions, email+password table, and “auth.users only” claim are gone.

**Verification:** Someone who has never seen the chat can follow README and reach the landing + sign-in OTP loop.

## What We're NOT Doing

- Rewriting `CLAUDE.md` / `AGENTS.md`
- English or bilingual README
- Architecture dump of `src/` (that stays in CLAUDE.md)
- Deleting `public/template.png` (owned by other polish if at all)
- Changing app code, env schemas, or CI (CI test step is `js-test-baseline`)

## Implementation Approach

One phase: rewrite `README.md` in place. Keep accurate bits from the current file (Node version, `.dev.vars`, Cloudflare deploy, GitHub secrets) and replace everything that describes the starter or the old auth model.

## Phase 1: Rewrite README.md

### Overview

Ship a product README that matches how Saved! actually runs.

### Changes Required:

#### 1. Root README

**File**: `README.md`

**Intent**: Satisfy 10xDevs documentation (README describes this project) and stop sending people to the starter clone / password signup.

**Contract**: Polish throughout. Sections, in order:

1. Title **Saved!** + 2–4 zdania wizji (cele, check-in NL, projekcja, panel wartości netto jako kontekst).
2. Stack (Astro 6 SSR, React 19, Tailwind 4, Supabase, Cloudflare Workers) — bez obrazka `template.png`.
3. Wymagania: Node z `.nvmrc`, npm, Docker na lokalny Supabase.
4. Quick start: `npm install`; `cp .env.example .env` i `cp .env.example .dev.vars`; `npx supabase start`; wklejenie anon key do obu plików; `npm run dev`. **Nie** `supabase init`. **Nie** clone `przeprogramowani/10x-astro-starter`.
5. Logowanie lokalne: formularz OTP; kody w Inbucket `http://127.0.0.1:54324`; Studio `http://localhost:54323`.
6. AI check-in: `npx wrangler login`; bez tego działa fallback ręczny.
7. Skrypty: `dev`, `build`, `preview`, `lint`, `format`, `deploy` — plus `test` tylko jeśli już istnieje w `package.json` (inaczej nie obiecuj skryptu, którego nie ma; S-10 go doda).
8. Deploy: Cloudflare Workers, sekrety `SUPABASE_*` / Wrangler. CI: lint + build na `main`.

Drop: tabela `/auth/signup` email+password; zdanie że nie ma tabel/migracji.

### Success Criteria:

#### Automated Verification:

- `README.md` contains `Saved!` and does not contain `10x-astro-starter`
- `README.md` mentions Inbucket or `54324`
- `README.md` mentions `.dev.vars`
- Lint/format of markdown if pre-commit runs prettier on `*.md` — `npx prettier --check README.md`

#### Manual Verification:

- README reads as Saved!, not a generic starter
- Steps match a cold local setup (Docker up, OTP in Inbucket)

**Implementation Note**: Pause for human skim of README before archive.

---

## Testing Strategy

### Unit Tests:

- None in this change

### Manual Testing Steps:

1. Read README end-to-end against actual commands
2. Confirm auth section matches `/auth/signin` OTP, not password

## Performance Considerations

None.

## Migration Notes

None. Markdown only.

## References

- Current README: `README.md`
- Env example: `.env.example`
- Auth send OTP: `src/pages/api/auth/send-otp.ts`
- Inbucket: `supabase/config.toml` `[inbucket]`
- Wrangler AI: `wrangler.jsonc`
- Change notes: `context/changes/product-readme/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Rewrite README.md

#### Automated

- [x] 1.1 `README.md` contains `Saved!` and does not contain `10x-astro-starter` — 99f1410
- [x] 1.2 `README.md` mentions Inbucket or `54324` — 99f1410
- [x] 1.3 `README.md` mentions `.dev.vars` — 99f1410
- [x] 1.4 `npx prettier --check README.md` — 99f1410

#### Manual

- [x] 1.5 README reads as Saved!, not a generic starter — 99f1410
- [x] 1.6 Steps match a cold local setup (Docker up, OTP in Inbucket) — 99f1410
