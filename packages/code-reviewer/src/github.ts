const COMMENT_MARKER = "<!-- ai-cr -->";
const LABEL_PASSED = "ai-cr:passed";
const LABEL_FAILED = "ai-cr:failed";
const LABEL_RETRY = "ai-cr:review";

export interface GitHubContext {
  token: string;
  repo: string;
  prNumber: number;
}

interface IssueComment {
  id: number;
  body: string;
}

function apiBase(repo: string): string {
  return `https://api.github.com/repos/${repo}`;
}

async function githubFetch(
  ctx: GitHubContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${ctx.token}`);
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "saved-ai-code-reviewer");

  const response = await fetch(`${apiBase(ctx.repo)}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API ${String(response.status)} ${path}: ${detail.slice(0, 500)}`);
  }
  return response;
}

export function formatReviewComment(params: {
  summary: string;
  scores: Record<string, number>;
  verdict: "pass" | "fail";
}): string {
  const rows = Object.entries(params.scores)
    .map(([name, value]) => `| ${name} | ${String(value)} |`)
    .join("\n");

  return [
    COMMENT_MARKER,
    `## AI code review — ${params.verdict.toUpperCase()}`,
    "",
    params.summary.trim(),
    "",
    "| Criterion | Score |",
    "| --- | --- |",
    rows,
    "",
    "_Advisory only. A human has the last word. This bot does not approve or merge._",
  ].join("\n");
}

export async function upsertPrComment(ctx: GitHubContext, body: string): Promise<void> {
  const marked = body.includes(COMMENT_MARKER) ? body : `${COMMENT_MARKER}\n${body}`;
  const list = await githubFetch(ctx, `/issues/${String(ctx.prNumber)}/comments?per_page=100`);
  const comments = (await list.json()) as IssueComment[];
  const existing = comments.find((comment) => comment.body.includes(COMMENT_MARKER));

  if (existing) {
    await githubFetch(ctx, `/issues/comments/${String(existing.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ body: marked }),
    });
    return;
  }

  await githubFetch(ctx, `/issues/${String(ctx.prNumber)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: marked }),
  });
}

async function deleteLabel(ctx: GitHubContext, name: string): Promise<void> {
  const encoded = encodeURIComponent(name);
  const response = await fetch(
    `${apiBase(ctx.repo)}/issues/${String(ctx.prNumber)}/labels/${encoded}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${ctx.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "saved-ai-code-reviewer",
      },
    },
  );
  if (response.status !== 404 && !response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API ${String(response.status)} delete label: ${detail.slice(0, 500)}`);
  }
}

export async function removeRetryLabel(ctx: GitHubContext): Promise<void> {
  await deleteLabel(ctx, LABEL_RETRY);
}

export async function applyVerdictLabels(
  ctx: GitHubContext,
  verdict: "pass" | "fail",
): Promise<void> {
  const add = verdict === "pass" ? LABEL_PASSED : LABEL_FAILED;
  const remove = verdict === "pass" ? LABEL_FAILED : LABEL_PASSED;
  await deleteLabel(ctx, remove);
  await githubFetch(ctx, `/issues/${String(ctx.prNumber)}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [add] }),
  });
}

export function resolveGitHubContext(env: NodeJS.ProcessEnv): GitHubContext | null {
  const token = env.GITHUB_TOKEN?.trim();
  const repo = env.GITHUB_REPOSITORY?.trim();
  const prRaw = env.PR_NUMBER?.trim();
  if (!token || !repo || !prRaw) {
    return null;
  }
  const prNumber = Number(prRaw);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return null;
  }
  return { token, repo, prNumber };
}
