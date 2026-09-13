# AI code reviewer (Cursor SDK)

Advisory pull-request review for Saved!. The agent scores a diff, posts a comment, and applies labels. It never approves or merges.

## Secrets

1. Mint a **Pro or team** user/service-account key at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Free-plan keys get `403 plan_required` on `GET /v1/models` and cannot start the SDK (local runtime still authenticates against that API).
2. Local: `export CURSOR_API_KEY=cursor_...` (do not put it in `.dev.vars` — that file is for the Cloudflare app).
3. GitHub: repo **Settings → Secrets and variables → Actions → New repository secret** named `CURSOR_API_KEY`.
4. `GITHUB_TOKEN` is provided by Actions; the workflow only needs `pull-requests: write`.

## Local smoke (M5L2)

```bash
cd packages/code-reviewer
npm ci
export CURSOR_API_KEY=cursor_...
npx tsx src/cli.ts --diff-file fixtures/simulated.diff --pr-title "Simulated review"
```

Or from the repo root: `git diff | npm run review`.

Expected: JSON with five scores, `verdict`, and `summary` on stdout. Usage (`durationMs`, token counts) goes to stderr.

## CI

- Workflow: `.github/workflows/ai-review.yml` on PRs to `main` and `workflow_dispatch`.
- Composite action: `.github/actions/ai-reviewer`.
- Retry: add the `ai-cr:review` label to the PR.
- Labels: `ai-cr:passed` (green path) or `ai-cr:failed`. A `fail` verdict does **not** fail the job.

## Evals (M5L3)

Compares `composer-2.5`, `gpt-5.5`, and `grok-4.6` on `fixtures/idor-handler.diff`.

```bash
cd packages/code-reviewer
export CURSOR_API_KEY=cursor_...
npm run eval
```

Also `.github/workflows/ai-review-eval.yml` (`workflow_dispatch` or PRs that touch this package).

## Champion screenshots (Mission Log M5L1 step 4)

After the first real PR run, capture:

1. Actions tab showing the **AI Code Review** workflow with at least one job.
2. Job logs (agent start + usage JSON on stderr).
3. The LLM comment on the pull request (`<!-- ai-cr -->`).
