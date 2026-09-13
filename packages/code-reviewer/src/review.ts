import { Agent, CursorAgentError } from "@cursor/sdk";
import { parseReview } from "./extract-json.ts";
import {
  applyVerdictLabels,
  formatReviewComment,
  removeRetryLabel,
  upsertPrComment,
  type GitHubContext,
} from "./github.ts";
import { buildReviewPrompt, JSON_RETRY_PROMPT } from "./prompt.ts";
import type { Review } from "./schema.ts";
import { createReviewTools } from "./tools.ts";

export class ReviewRunError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReviewRunError";
    this.exitCode = exitCode;
  }
}

export interface ReviewRequest {
  apiKey: string;
  repoRoot: string;
  diff: string;
  prTitle: string;
  prBody: string;
  modelId: string;
  github: GitHubContext | null;
  skipGithub: boolean;
  sandbox: boolean;
}

export interface ReviewOutcome {
  review: Review;
  durationMs?: number;
  usage?: unknown;
}

function logUsage(label: string, result: { durationMs?: number; usage?: unknown; id?: string }) {
  console.error(
    JSON.stringify({
      event: "ai-review-usage",
      label,
      runId: result.id,
      durationMs: result.durationMs,
      usage: result.usage ?? null,
    }),
  );
}

function startupErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "plan_required" || /not available for free users/i.test(message)) {
    return `${message} Cursor Agent SDK needs a Pro or team API key from https://cursor.com/dashboard/integrations (free-plan keys receive 403 on GET /v1/models).`;
  }
  return message;
}

function isSandboxConfigError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  return (
    err.name === "ConfigurationError" ||
    /sandbox/i.test(err.message) ||
    /bubblewrap/i.test(err.message)
  );
}

async function runAgentLoop(
  request: ReviewRequest,
  sandboxEnabled: boolean,
): Promise<ReviewOutcome> {
  const github = request.skipGithub ? null : request.github;
  const tools = createReviewTools({ repoRoot: request.repoRoot, github });

  await using agent = await Agent.create({
    apiKey: request.apiKey,
    model: { id: request.modelId },
    disallowedTools: ["edit", "shell", "task"],
    local: {
      cwd: request.repoRoot,
      settingSources: [],
      sandboxOptions: { enabled: sandboxEnabled },
      customTools: tools,
    },
  });

  const userPrompt = buildReviewPrompt({
    prTitle: request.prTitle,
    prBody: request.prBody,
    diff: request.diff,
    prNumber: github?.prNumber,
    repo: github?.repo,
  });

  const first = await agent.send(userPrompt);
  console.error(
    JSON.stringify({
      event: "ai-review-started",
      runId: first.id,
      agentId: agent.agentId,
      sandbox: sandboxEnabled,
    }),
  );
  const firstResult = await first.wait();
  logUsage("turn-1", firstResult);

  if (firstResult.status === "error") {
    throw new ReviewRunError(
      `Review run failed: ${firstResult.error?.message ?? firstResult.status}`,
      2,
    );
  }

  let review = parseReview(firstResult.result);
  let durationMs = firstResult.durationMs;
  let usage: unknown = firstResult.usage;

  if (!review) {
    const second = await agent.send(JSON_RETRY_PROMPT);
    const secondResult = await second.wait();
    logUsage("turn-2", secondResult);
    if (secondResult.status === "error") {
      throw new ReviewRunError(
        `JSON retry run failed: ${secondResult.error?.message ?? secondResult.status}`,
        2,
      );
    }
    review = parseReview(secondResult.result);
    durationMs = secondResult.durationMs;
    usage = secondResult.usage;
  }

  if (!review) {
    throw new ReviewRunError("Agent did not return JSON matching the review schema", 2);
  }

  return { review, durationMs, usage };
}

export async function reviewDiff(request: ReviewRequest): Promise<ReviewOutcome> {
  const github = request.skipGithub ? null : request.github;

  if (github) {
    await removeRetryLabel(github).catch((err: unknown) => {
      console.error("Could not remove ai-cr:review label:", err);
    });
  }

  let outcome: ReviewOutcome;
  try {
    outcome = await runAgentLoop(request, request.sandbox);
  } catch (err) {
    if (request.sandbox && isSandboxConfigError(err)) {
      console.error("Sandbox unavailable; retrying without sandbox.");
      outcome = await runAgentLoop(request, false);
    } else if (err instanceof CursorAgentError) {
      throw new ReviewRunError(`Review did not start: ${startupErrorMessage(err)}`, 1, { cause: err });
    } else {
      throw err;
    }
  }

  if (github) {
    const comment = formatReviewComment({
      summary: outcome.review.summary,
      verdict: outcome.review.verdict,
      scores: {
        implementationCorrectness: outcome.review.implementationCorrectness,
        idiomaticity: outcome.review.idiomaticity,
        complexity: outcome.review.complexity,
        testRiskCoverage: outcome.review.testRiskCoverage,
        securitySafety: outcome.review.securitySafety,
      },
    });
    await upsertPrComment(github, comment);
    await applyVerdictLabels(github, outcome.review.verdict);
  }

  return outcome;
}
