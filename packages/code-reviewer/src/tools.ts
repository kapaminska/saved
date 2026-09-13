import { readFile } from "node:fs/promises";
import path from "node:path";
import { upsertPrComment, type GitHubContext } from "./github.ts";

const CHANGE_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function resolvePlanPath(repoRoot: string, target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) {
    return null;
  }

  const fromPath = /context\/changes\/([^/]+)\/plan\.md$/.exec(trimmed.replaceAll("\\", "/"));
  const changeId = fromPath?.[1] ?? (CHANGE_ID_RE.test(trimmed) ? trimmed : null);
  if (!changeId) {
    return null;
  }

  const resolved = path.resolve(repoRoot, "context/changes", changeId, "plan.md");
  const root = path.resolve(repoRoot);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return resolved;
}

export function createReviewTools(params: { repoRoot: string; github: GitHubContext | null }) {
  return {
    read_plan: {
      description:
        "Read an implementation plan from context/changes/<change-id>/plan.md. Accepts a change-id (e.g. oauth-login) or a plan.md path under context/changes/. Returns the plan text, or { found: false } when none exists.",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            description: "A change-id or a path to plan.md under context/changes/.",
          },
        },
        required: ["target"],
      },
      annotations: { readOnlyHint: true, title: "Read implementation plan" },
      async execute(args: Record<string, unknown>): Promise<string> {
        const planPath = resolvePlanPath(params.repoRoot, asString(args.target));
        if (!planPath) {
          return JSON.stringify({ found: false });
        }
        try {
          const contents = await readFile(planPath, "utf8");
          return JSON.stringify({ found: true, path: planPath, contents });
        } catch {
          return JSON.stringify({ found: false });
        }
      },
    },
    post_pr_comment: {
      description:
        "Publish or update the AI review comment on the current pull request. Always include scores, verdict, and a 2–3 sentence summary. The host upserts by the <!-- ai-cr --> marker.",
      inputSchema: {
        type: "object",
        properties: {
          body: {
            type: "string",
            description: "Markdown comment body for the pull request.",
          },
        },
        required: ["body"],
      },
      annotations: {
        title: "Post PR comment",
        idempotentHint: true,
        openWorldHint: true,
      },
      async execute(args: Record<string, unknown>): Promise<string> {
        if (!params.github) {
          return JSON.stringify({ posted: false, reason: "no GitHub context" });
        }
        const body = asString(args.body).trim();
        if (!body) {
          return JSON.stringify({ posted: false, reason: "empty body" });
        }
        await upsertPrComment(params.github, body);
        return JSON.stringify({ posted: true });
      },
    },
  };
}
