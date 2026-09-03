# CLAUDE.md

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
- `npm test` — Vitest (`vitest run`; unit + API handler tests, no Docker)
- `npm run lint:fix` — auto-fix lint issues
- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)
- `npx astro sync` — regenerate type definitions (run before lint/build if types are stale)
- `npx shadcn@latest add [name]` — add a shadcn/ui component

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Astro 6 SSR app** (full server rendering, `output: "server"`) with React 19 islands, Tailwind CSS 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers via `@astrojs/cloudflare` adapter.

### Rendering & runtime

Every page is server-rendered. There is no static/prerender mode. The Cloudflare adapter means `Astro.locals` and middleware run on the workerd edge runtime — no Node.js-only APIs.

### Auth flow

1. `src/lib/supabase.ts` — factory that creates a Supabase SSR client with cookie-based sessions. Returns `null` when env vars are missing (graceful degradation for unconfigured local dev). Uses `astro:env/server` imports for `SUPABASE_URL` and `SUPABASE_KEY`.
2. `src/middleware.ts` — resolves the current user on every request, sets `context.locals.user`. Redirects unauthenticated users away from routes in the `PROTECTED_ROUTES` array.
3. API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
4. Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
5. `src/env.d.ts` — declares `App.Locals` with typed `user` field.

To protect a new route, add its path prefix to `PROTECTED_ROUTES` in `src/middleware.ts`.

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Astro components** for static content/layout; **React components** (islands) only when client interactivity is needed.
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings.
- **shadcn/ui**: components in `src/components/ui/`, "new-york" style, lucide icons. Config in `components.json`.
- **API routes**: uppercase `GET`/`POST` exports.
- **Supabase migrations**: `supabase/migrations/` with format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables.
- **React**: no `"use client"` directives (not Next.js). Hooks go in `src/components/hooks/`.
- **Services/helpers**: `src/lib/` (or `src/lib/services/` for business logic).
- **Shared types**: `src/types.ts`.

### Environment

- Env vars: see `.env.example`. For Cloudflare local dev, use `.dev.vars` instead of `.env`.
- Local Supabase: `npx supabase start` (requires Docker)

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs lint + build on push/PR to `master`. Requires `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets.
