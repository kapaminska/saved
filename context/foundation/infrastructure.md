---
project: "Saved!"
researched_at: 2026-06-02
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 SSR
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project already ships with `@astrojs/cloudflare` v13.5+ and a fully configured `wrangler.jsonc` targeting the workerd runtime — deploying to Cloudflare requires zero adapter changes, zero migration work. Cloudflare scored 5/5 on all agent-friendly criteria (CLI-first via wrangler v4, fully serverless, agent-readable docs with `llms.txt`, deterministic deploy/rollback API, and a GA MCP server suite covering 2,500+ endpoints). The free tier handles 100k requests/day, which comfortably covers an MVP savings tracker with low QPS. External Supabase connects over the network with no platform-imposed restriction.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total | Migration cost |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass (GA) | 5/5 | None — native adapter |
| **Netlify** | Pass | Pass | Pass | Pass | Pass (GA) | 5/5 | Adapter swap to `@astrojs/netlify` |
| **Vercel** | Pass | Pass | Pass | Pass | Partial (beta MCP) | 4.5/5 | Adapter swap to `@astrojs/vercel` |
| **Railway** | Pass | Pass | Partial (no llms.txt) | Pass | Pass (GA) | 4.5/5 | Adapter swap to `@astrojs/node` |
| **Render** | Pass | Partial | Pass | Pass | Pass (GA) | 4.5/5 | Adapter swap to `@astrojs/node` |
| **Fly.io** | Partial | Partial | Partial | Partial | Partial (experimental) | 2.5/5 | Adapter swap + Dockerfile |

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Zero migration cost is the decisive factor. The project's `astro.config.mjs` already declares `adapter: cloudflare()`, `wrangler.jsonc` is configured with `nodejs_compat`, correct entrypoint, and assets binding. Every other platform requires changing the adapter, auditing workerd-specific code, and learning a new deploy toolchain. Beyond migration cost, Cloudflare leads on agent-friendly criteria: wrangler v4 is a mature CLI with deploy/rollback/tail, the MCP server suite is GA and covers the full Cloudflare API, and docs publish `llms.txt` at every product level. The free tier (100k req/day, $0) covers MVP traffic with margin; the $5/month paid plan removes CPU time limits and unlocks all bindings if needed.

#### 2. Netlify

Matched Cloudflare on all five criteria. The `@astrojs/netlify` adapter is maintained by the Astro core team and supports Astro 6 from day one. The free tier offers 125,000 serverless function invocations/month (each SSR render = one invocation), 100 GB bandwidth, and 300 build minutes. The GA MCP server (6 tools) and `llms.txt` support make it fully agent-operable. The gap: adapter swap is required (removing workerd-specific APIs, switching to Node.js serverless functions), and function timeout defaults to 10 seconds (configurable to 26s) — tighter than Cloudflare's paid-tier 5-minute CPU limit.

#### 3. Railway

Excellent developer experience — Nixpacks auto-detects Node.js, `railway up` deploys with live streaming, and the GA MCP server (local + remote) has first-class Claude Code integration. Persistent containers mean no serverless function limits or cold starts. The gap: no free tier ($5/month Hobby plan with $5 compute credit), adapter swap to `@astrojs/node` required, and docs lack `llms.txt` (though markdown-accessible via `.md` extension). Best suited if workerd runtime becomes a blocker and the developer is willing to pay from day one.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **workerd is not Node.js.** Despite `nodejs_compat`, npm packages relying on native Node.js APIs (fs, net, child_process) will fail at runtime. Every new dependency requires a "does it run on workerd?" check.
2. **128 MB memory limit per invocation.** AI check-in parsing (FR-011) streams an LLM response while holding goal structures in memory. Complex check-ins with many goals could approach this ceiling — failure is a hard kill, not graceful degradation.
3. **Bundle size limit: 3 MB (free) / 10 MB (paid).** Astro SSR bundles with React 19, shadcn/ui, and an LLM client library grow toward the limit. Hitting it blocks deploys with an opaque error.
4. **Every DB query crosses the network** from Cloudflare's edge to Supabase's region. For a single-region EU user base this adds ~20-50ms per query — acceptable but not zero.
5. **Pages deprecation creates documentation confusion.** Tutorials and Stack Overflow answers mix Pages-era and Workers-era advice. A solo developer debugging deploy issues will encounter outdated guidance frequently.

### Pre-Mortem — How This Could Fail

The team deployed Saved! with the existing `@astrojs/cloudflare` adapter. Initial deploy was smooth — zero migration, wrangler handled everything. Three months in, the AI parsing feature needed a heavier LLM client library with a streaming parser. The bundle crossed 3 MB on the free tier; they upgraded to the $5/month paid plan. At month four, a user reported check-ins silently failing — the payment parsing endpoint hit the 128 MB memory wall when processing 12 goals in a single natural-language sentence with a verbose Claude response. The fix required splitting the parsing into smaller invocations, adding complexity. Meanwhile, debugging was harder than expected: `wrangler tail` showed live logs, but reproducing edge-runtime issues locally required `wrangler dev` which didn't perfectly match production workerd behavior. The developer spent several evenings debugging a Supabase auth cookie issue that worked in Node.js but behaved differently on workerd's Request/Response polyfills. By month six, the app worked but the developer had accumulated significant workerd-specific tribal knowledge that wouldn't transfer to other platforms.

### Unknown Unknowns

- **`wrangler dev` does not perfectly replicate production workerd behavior**, especially around request streaming and cookie handling. Bugs that appear only in production are harder to diagnose.
- **Supabase Auth cookie handling on edge runtimes** has known subtle differences — `@supabase/ssr`'s cookie adapter assumes Node.js `Request`/`Response` semantics that workerd implements slightly differently. Most likely source of "works in dev, broken in prod" incidents.
- **Free tier's 10ms CPU limit per request** is stricter than it sounds. Server-rendering a React 19 page with islands, running Tailwind class merging, and fetching from Supabase can exceed 10ms of CPU time. The paid tier ($5/mo) removes this limit — discovering this after launch is a surprise cost.
- **No Cron Triggers on free tier.** If the app later needs scheduled jobs (monthly check-in reminders), the paid plan is required.
- **Workers logs are ephemeral.** `wrangler tail` streams live but there's no built-in log persistence or search. Post-mortem debugging requires integrating Logpush to R2 or a third-party logging service.

## Operational Story

- **Preview deploys**: `wrangler deploy --env preview` creates a named environment with its own URL. For PR-based previews, wire `wrangler deploy --env pr-${{ github.event.pull_request.number }}` in GitHub Actions. Preview URLs are public by default — add Cloudflare Access (free for up to 50 users) if the app handles real user data during preview.
- **Secrets**: Production secrets live in Workers Secrets (`wrangler secret put SUPABASE_URL`, `wrangler secret put SUPABASE_KEY`). Secrets are encrypted at rest, not visible in the dashboard after creation, and scoped per environment. Local dev uses `.dev.vars` (gitignored). GitHub Actions secrets feed CI deploys.
- **Rollback**: `wrangler rollback [version-id]` instantly reverts to a prior version — no rebuild, ~1 second. Defaults to the version before latest if no ID specified. Database migrations do not roll back automatically — Supabase migrations must be handled separately.
- **Approval**: Human-only actions: publishing to production for the first time, rotating Supabase service-role keys, deleting the Workers project, changing DNS. Agent-safe actions: deploying, rolling back, tailing logs, reading deployment status.
- **Logs**: `wrangler tail --format json` for live structured logs. `wrangler tail --status error` to filter errors. For persistent logs: enable `observability.enabled: true` in `wrangler.jsonc` (already configured) and use Workers Logs or Logpush to R2.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| npm package incompatible with workerd runtime | Devil's advocate | M | M | Check workerd compatibility before adding dependencies. Keep `nodejs_compat` flag enabled. Test in `wrangler dev` before deploy. |
| 128 MB memory limit hit during AI check-in parsing | Devil's advocate | L | H | Stream LLM responses without buffering full response in memory. Limit max goals per check-in. Monitor with `wrangler tail`. |
| Bundle size exceeds 3 MB on free tier | Devil's advocate | M | M | Upgrade to $5/mo paid plan when bundle approaches limit. Use dynamic imports to split server-side code. |
| Supabase auth cookies behave differently on workerd vs Node.js | Unknown unknowns | M | H | Test auth flow end-to-end in deployed environment early (not just local dev). Pin `@supabase/ssr` version and test after upgrades. |
| Free tier 10ms CPU limit exceeded on SSR pages | Unknown unknowns | H | M | Budget $5/mo paid plan from production launch. Free tier is for development/staging only. |
| Ephemeral logs make post-mortem debugging difficult | Unknown unknowns | M | M | Enable Workers observability (already configured). Set up Logpush to R2 bucket before first real user. |
| `wrangler dev` / production behavior divergence | Unknown unknowns | M | M | Deploy to a preview environment for integration testing. Do not rely solely on local dev for edge-runtime validation. |
| Pages-era documentation confuses debugging | Devil's advocate | M | L | Prefer official Cloudflare Workers docs (`developers.cloudflare.com/workers/`) over community tutorials. Use `llms.txt` for agent-driven troubleshooting. |
| Monthly check-in reminders need Cron Triggers (paid-only) | Unknown unknowns | L | L | Not in MVP scope (PRD has no scheduled jobs). Revisit when/if notification features are added. |
| Supabase query latency from edge to single region | Devil's advocate | L | L | Acceptable for EU-only user base (~20-50ms). If latency becomes a concern, use Cloudflare's Smart Placement to pin the Worker near Supabase's region. |

## Getting Started

These steps are specific to the current project state: Astro 6.3+ with `@astrojs/cloudflare` 13.5+, wrangler 4.90+ already in devDependencies, and `wrangler.jsonc` already configured.

1. **Rename the Worker.** In `wrangler.jsonc`, change `"name": "10x-astro-starter"` to `"name": "saved"`. This becomes the Workers subdomain (`saved.<your-subdomain>.workers.dev`).

2. **Authenticate with Cloudflare.** Run `npx wrangler login` — opens a browser for OAuth. Requires a free Cloudflare account.

3. **Set up local secrets.** Create `.dev.vars` in the project root (already gitignored by the starter):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```

4. **Deploy.** Run `npm run build && npx wrangler deploy`. The first deploy creates the Worker on Cloudflare. Subsequent deploys update it in ~2 seconds.

5. **Set production secrets.** Run `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` — prompts for the value interactively. These are encrypted and scoped to the production environment.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (GitHub Actions workflow already exists in the project)
- Production-scale architecture (multi-region, HA, DR)
