import path from "node:path";
import { fileURLToPath } from "node:url";
import { reviewDiff } from "./review.ts";

interface ProviderOptions {
  id?: string;
  config?: {
    model?: string;
  };
}

interface CallApiContext {
  vars?: Record<string, unknown>;
}

export default class CursorReviewProvider {
  readonly config: { model?: string };
  readonly providerId: string;

  constructor(options: ProviderOptions = {}) {
    this.config = options.config ?? {};
    this.providerId = options.id ?? `cursor-review:${this.config.model ?? "composer-2.5"}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string, context?: CallApiContext) {
    const apiKey = process.env.CURSOR_API_KEY?.trim();
    if (!apiKey) {
      return { error: "CURSOR_API_KEY is missing" };
    }

    const diff = String(context?.vars?.diff ?? prompt);
    const packageDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
    const repoRoot = path.resolve(process.env.GITHUB_WORKSPACE ?? path.join(packageDir, "../.."));

    try {
      const outcome = await reviewDiff({
        apiKey,
        repoRoot,
        diff,
        prTitle: String(context?.vars?.title ?? "promptfoo eval fixture"),
        prBody: String(context?.vars?.body ?? ""),
        modelId: this.config.model ?? "composer-2.5",
        github: null,
        skipGithub: true,
        sandbox: process.env.AI_REVIEW_SANDBOX !== "0",
      });

      return {
        output: JSON.stringify(outcome.review),
        tokenUsage: usageToTokens(outcome.usage),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}

function usageToTokens(usage: unknown): { total?: number; prompt?: number; completion?: number } {
  if (!usage || typeof usage !== "object") {
    return {};
  }
  const record = usage as Record<string, unknown>;
  const prompt = asNumber(record.inputTokens ?? record.promptTokens);
  const completion = asNumber(record.outputTokens ?? record.completionTokens);
  const total = asNumber(record.totalTokens) ?? (prompt !== undefined && completion !== undefined ? prompt + completion : undefined);
  return { total, prompt, completion };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
