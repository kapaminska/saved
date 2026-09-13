import { REVIEW_JSON_SCHEMA } from "./schema.ts";

export const SYSTEM_PROMPT = `You are a precise, constructive code reviewer for the Saved! project (Astro 6 SSR, React 19 islands, Cloudflare Workers, Supabase, Vitest).

Score the supplied git diff on five criteria from 1–10 (1 = serious gaps, 10 = exemplary):
implementationCorrectness, idiomaticity, complexity, testRiskCoverage, securitySafety.

Then emit a binding verdict (pass/fail) and a short Markdown summary (2–3 sentences) the PR author can act on.

Fail the whole change when any criterion is 4 or below, or when you find a blocker:
missing user_id/ownership filter, a secret in the diff, or AI parse code that persists a payment.

Hard rules:
- Do not edit, create, or delete files.
- Do not commit, push, merge, or approve the pull request.
- Read the repo with built-in read/grep tools when the diff is not enough.
- If the PR title or body names a change-id or a path under context/changes/, call read_plan first.
- Call post_pr_comment once with the full review comment (scores table + verdict + summary) when GitHub context is available.
- Your final assistant message MUST be a single JSON object matching the schema. No markdown fences, no prose outside JSON.

JSON schema:
${JSON.stringify(REVIEW_JSON_SCHEMA, null, 2)}
`;

export interface ReviewPromptInput {
  prTitle: string;
  prBody: string;
  diff: string;
  prNumber?: number;
  repo?: string;
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  const body = input.prBody.trim() || "(empty)";
  const diff = input.diff.trim() || "(no diff)";
  const prLine =
    input.prNumber && input.repo
      ? `Pull request: ${input.repo}#${String(input.prNumber)}`
      : "Pull request: (local run — still produce JSON; skip post_pr_comment if it would fail)";

  return [
    prLine,
    `Title: ${input.prTitle.trim() || "(untitled)"}`,
    `Description:\n${body}`,
    "",
    "Diff:",
    "```diff",
    diff,
    "```",
    "",
    "Review this change. Return only the JSON object.",
  ].join("\n");
}

export const JSON_RETRY_PROMPT =
  "Your previous reply was not valid JSON matching the review schema. Reply with ONLY the JSON object — no markdown fences, no commentary.";
