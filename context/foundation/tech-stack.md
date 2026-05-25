---
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
---

## Why this stack

Solo developer shipping a savings-tracker MVP (Saved!) in 3 weeks after hours, with magic-link auth and AI-powered natural-language check-in parsing. The 10x Astro Starter is the recommended default for (web-app, js) and clears all four agent-friendly gates: typed (TypeScript + Zod), convention-based (Astro file-based routing + island architecture), popular in JS training data, and well-documented. Supabase provides PostgreSQL, auth, and Row Level Security out of the box — matching the PRD's magic-link requirement (FR-001) and strict per-user data isolation. Cloudflare Pages handles edge deployment with the starter's default adapter. AI features (FR-011, FR-013) are LLM API calls that work on any stack; no framework-specific AI integration is needed. CI runs on GitHub Actions with auto-deploy-on-merge. Bootstrapper confidence is first-class — the starter is registered with a valid CLI and expected to scaffold smoothly.
