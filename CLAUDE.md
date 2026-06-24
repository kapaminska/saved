# CLAUDE.md

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` — ESLint with type-checked rules
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

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 5

Scale the single-change cycle into parallel work with **worktrees, goal-directed delegation, and multi-session orchestration**:

```
worktree per change -> /goal or claude -p -> PR -> review -> merge
```

The lesson focus is safe throughput: isolated contexts, choosing the right execution mode, and capping parallelism at review capacity.

### Task Router - Where to start

| Skill                                                   | Use it when                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code isolation**                                      |                                                                                                                                              |
| `git worktree add`                                      | You need a separate working directory for a parallel change. One change per worktree, one fresh agent context per worktree.                  |
| **Complex changes**                                     |                                                                                                                                              |
| `/10x-implement <change-id> phase <n>`                  | The change has multiple phases, needs manual gates, or benefits from interactive decision-making during execution.                           |
| **Simple changes**                                      |                                                                                                                                              |
| `/goal`                                                 | You have a clear, bounded task and want goal-directed delegation. The agent works autonomously toward the stated goal with a stop condition. |
| `claude -p`                                             | You want headless execution for a well-defined task. The Ralph Wiggum loop (run, check, retry) is the universal autonomous pattern.          |
| **Multi-session orchestration**                         |                                                                                                                                              |
| Superset / Conductor / Antigravity / VS Code Agent View | You are running multiple agent sessions in parallel and need visibility, coordination, or session management across them.                    |

### Parallel work rules

- One change per worktree or isolated workspace. One fresh agent context per change.
- Choose interactive `/10x-implement` for complex changes, `/goal` or `claude -p` for simple ones.
- Parallelism is capped by review capacity. More agents without review means more unreviewed code, not higher throughput.
- The quality pain from faster shipping is intentional — it bridges into Module 3 testing gates.

### Lesson boundaries

- Do not reteach interactive `/10x-implement` or `/10x-impl-review`; those are Lessons 2 and 3.
- Do not introduce testing strategy here. The quality pain is the motivation for Module 3.
- Worktrees are a mechanism for isolation, not the topic of a full git tutorial.

### Paths used by this lesson

- `context/changes/<change-id>/` - active change folder
- `context/changes/<change-id>/plan.md` - implementation input for any execution mode

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
