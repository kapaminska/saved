---
bootstrapped_at: 2026-05-23T12:56:02Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: saved
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: saved
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

Solo developer shipping a savings-tracker MVP (Saved!) in 3 weeks after hours, with magic-link auth and AI-powered natural-language check-in parsing. The 10x Astro Starter is the recommended default for (web-app, js) and clears all four agent-friendly gates: typed (TypeScript + Zod), convention-based (Astro file-based routing + island architecture), popular in JS training data, and well-documented. Supabase provides PostgreSQL, auth, and Row Level Security out of the box — matching the PRD's magic-link requirement (FR-001) and strict per-user data isolation. Cloudflare Pages handles edge deployment with the starter's default adapter. AI features (FR-011, FR-013) are LLM API calls that work on any stack; no framework-specific AI integration is needed. CI runs on GitHub Actions with auto-deploy-on-merge. Bootstrapper confidence is first-class — the starter is registered with a valid CLI and expected to scaffold smoothly.

## Pre-scaffold verification

| Signal        | Value                                                   | Severity | Notes                                      |
| ------------- | ------------------------------------------------------- | -------- | ------------------------------------------ |
| npm package   | not run                                                 | —        | cmd_template uses git clone, not npm create |
| GitHub repo   | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card.docs_url via GitHub API           |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: CLAUDE.md
**.gitignore handling**: moved silently (no pre-existing .gitignore in cwd)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** v5.6.3–5.8.0 (transitive): DoS via sparse array deserialization. Advisory: GHSA-77vg-94rm-hx3p, CVSS 7.5. Fix available via `npm audit fix`.

#### MODERATE findings

- **@astrojs/check** (direct): via @astrojs/language-server. Fix available (downgrade to 0.9.2, semver-major).
- **@astrojs/language-server** (transitive): via volar-service-yaml. Fix available via @astrojs/check downgrade.
- **@cloudflare/vite-plugin** (transitive): via miniflare, wrangler, ws. Fix available.
- **miniflare** (transitive): via ws. Fix available.
- **volar-service-yaml** (transitive): via yaml-language-server. Fix available via @astrojs/check downgrade.
- **wrangler** (direct): via miniflare. Fix available.
- **ws** (transitive): uninitialized memory disclosure (GHSA-58qx-3vcg-4xpx, CVSS 4.4). Fix available.
- **yaml** (transitive): stack overflow via deeply nested YAML collections (GHSA-48c2-rrv3-qjmp, CVSS 4.3). Fix available via @astrojs/check downgrade.
- **yaml-language-server** (transitive): via yaml. Fix available via @astrojs/check downgrade.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | true               |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
