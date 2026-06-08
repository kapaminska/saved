---
project: saved
platform: Cloudflare Workers
deployed_at: 2026-06-02
secrets_configured_at: 2026-06-05
url: https://saved.kapaminska.workers.dev
current_version: 2c3bc5f6-342d-4cdb-84d7-72c902765f44
bundle_size_kb: 1911
---

## Deployment Summary

**Saved!** deployed to Cloudflare Workers on 2026-06-02.

- **URL**: https://saved.kapaminska.workers.dev
- **Worker name**: `saved`
- **Account**: kapaminska@gmail.com (`afe56f90e089c75070a81c26966af0b6`)
- **Bundle**: 1911 KiB / 390 KiB gzipped (well under 3 MB free tier limit)
- **Startup time**: 22–23 ms
- **Tier**: Free (100k req/day; upgrade to $5/mo paid plan if CPU limit issues appear)

## Bindings

| Binding | Resource |
|---|---|
| `env.SESSION` | KV Namespace (`saved-session`) |
| `env.IMAGES` | Cloudflare Images |
| `env.ASSETS` | Static assets from `dist/client` |

## Secrets

| Name | Status |
|---|---|
| `SUPABASE_URL` | Configured (2026-06-05) |
| `SUPABASE_KEY` | Configured (2026-06-05) |

## What Changed from Starter Kit

- `wrangler.jsonc`: renamed `10x-astro-starter` → `saved`
- `package.json`: renamed, added `deploy` script
- `src/layouts/Layout.astro`: default title → "Saved!"
- `.github/workflows/ci.yml`: renamed to CI/CD, fixed `master` → `main`, added deploy job

## CD Pipeline

GitHub Actions CI/CD workflow added (`.github/workflows/ci.yml`):
- **CI**: lint + build on every push/PR to `main`
- **CD**: auto-deploy via `wrangler deploy` on push to `main` (after CI passes)
- **Required GitHub secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`
- **Status**: workflow file ready; GitHub secrets need to be configured to activate CD

## Known Risks (from infrastructure.md)

- Free tier 10ms CPU limit may be tight for SSR — monitor with `wrangler tail`
- Supabase auth cookies may behave differently on workerd — test full auth flow on production
- Bundle size will grow when AI parsing is added — watch for 3 MB limit
- `wrangler dev` does not perfectly replicate production workerd behavior

## Rollback

```bash
npx wrangler rollback
```

## Next Steps

1. Test the live app: landing page, auth flow, protected routes
2. Configure GitHub secrets to activate CD pipeline
3. Monitor with `npx wrangler tail --format json` during initial usage
