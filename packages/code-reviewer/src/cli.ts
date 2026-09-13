import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveGitHubContext } from "./github.ts";
import { ReviewRunError, reviewDiff } from "./review.ts";

const DEFAULT_MODEL = "composer-2.5";

interface CliFlags {
  diffFile?: string;
  prTitle: string;
  prBody: string;
  prNumber?: string;
  repo?: string;
  cwd?: string;
  model?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    prTitle: process.env.PR_TITLE ?? "",
    prBody: process.env.PR_BODY ?? "",
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--diff-file":
        flags.diffFile = next;
        i += 1;
        break;
      case "--pr-title":
        flags.prTitle = next ?? "";
        i += 1;
        break;
      case "--pr-body":
        flags.prBody = next ?? "";
        i += 1;
        break;
      case "--pr-number":
        flags.prNumber = next;
        i += 1;
        break;
      case "--repo":
        flags.repo = next;
        i += 1;
        break;
      case "--cwd":
        flags.cwd = next;
        i += 1;
        break;
      case "--model":
        flags.model = next;
        i += 1;
        break;
      case "--help":
      case "-h":
        flags.help = true;
        break;
      default:
        break;
    }
  }

  return flags;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeGithubOutput(verdict: string) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    return;
  }
  await appendFile(outputFile, `verdict=${verdict}\n`);
}

function printHelp() {
  console.error(`Usage: npx tsx src/cli.ts [--diff-file path] [--pr-title t] [--pr-body b]

Reads a git diff from --diff-file or stdin. Requires CURSOR_API_KEY.
Optional GitHub: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER (or --pr-number / --repo).
`);
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new ReviewRunError("CURSOR_API_KEY is missing", 1);
  }

  const packageDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const repoRoot = path.resolve(flags.cwd ?? process.env.GITHUB_WORKSPACE ?? path.join(packageDir, "../.."));

  const diff = flags.diffFile
    ? await readFile(path.resolve(flags.diffFile), "utf8")
    : await readStdin();

  const env = {
    ...process.env,
    PR_NUMBER: flags.prNumber ?? process.env.PR_NUMBER,
    GITHUB_REPOSITORY: flags.repo ?? process.env.GITHUB_REPOSITORY,
  };

  const outcome = await reviewDiff({
    apiKey,
    repoRoot,
    diff,
    prTitle: flags.prTitle,
    prBody: flags.prBody,
    modelId: flags.model ?? process.env.CURSOR_MODEL ?? DEFAULT_MODEL,
    github: resolveGitHubContext(env),
    skipGithub: process.env.SKIP_GITHUB === "1",
    sandbox: process.env.AI_REVIEW_SANDBOX !== "0",
  });

  await writeGithubOutput(outcome.review.verdict);
  console.log(JSON.stringify(outcome.review, null, 2));
}

try {
  await main();
} catch (err) {
  const exitCode = err instanceof ReviewRunError ? err.exitCode : 1;
  console.error(err instanceof Error ? err.message : err);
  process.exit(exitCode);
}
