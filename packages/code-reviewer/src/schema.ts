import { z } from "zod";

const score = (label: string, one: string, ten: string) =>
  z.number().describe(
    `${label} on a 1–10 scale (1 = serious gaps, 10 = exemplary). 1: ${one} 10: ${ten}`,
  );

export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: score(
    "Implementation correctness: whether the code does what the PR claims",
    "logic is wrong or silently breaks existing behaviour.",
    "correct on the happy path, edge cases, and error handling.",
  ),
  idiomaticity: score(
    "Idiomaticity: Astro 6 SSR, React islands only when interactive, @/ alias, cn(), no use client, no Node-only APIs on the Cloudflare edge",
    "starter conventions are broken.",
    "matches neighbouring files and CLAUDE.md conventions.",
  ),
  complexity: score(
    "Complexity: simplest solution that fits the problem",
    "unnecessary abstraction or duplication.",
    "the change is proportional to the diff.",
  ),
  testRiskCoverage: score(
    "Test coverage proportional to risk (Vitest colocated tests; cheapest signal per context/foundation/test-plan.md; do not demand e2e)",
    "no test on money, auth, ownership, or AI-write paths that this diff touches.",
    "the cheapest test that would catch a real regression is present.",
  ),
  securitySafety: score(
    "Security: user_id/ownership filters, no secrets, AI parse must not persist payments",
    "IDOR, leaked secret, or a write that bypasses auth/ownership.",
    "same boundaries as existing handlers (eq user_id, 404 on missing row).",
  ),
  verdict: z.enum(["pass", "fail"]).describe(
    "Binding verdict for the whole change. fail if any criterion is 4 or below, or a blocker finding exists (missing user_id filter, secret in the diff, AI persisting a payment).",
  ),
  summary: z
    .string()
    .describe(
      "Markdown summary, 2–3 sentences, ready to paste as a PR comment so the author can act.",
    ),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;

export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA);
