import { matchGoalName } from "./goal-name-match";
import { parseAiResponse } from "./parse-schema";

const PARSE_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export interface ParsedProposal {
  goalId: string;
  goalName: string;
  amount: number;
  rawGoalName: string;
}

export interface UnrecognizedEntry {
  rawGoalName: string;
  amount: number;
}

interface ActiveGoal {
  id: string;
  name: string;
}

interface ParseSuccess {
  ok: true;
  proposals: ParsedProposal[];
  unrecognized: UnrecognizedEntry[];
}

interface ParseFailure {
  ok: false;
  reason: "ai_error" | "invalid_response";
}

function buildSystemPrompt(goalNames: string[]): string {
  const goalList = goalNames.map((name) => `- ${name}`).join("\n");

  return [
    "You extract savings check-in payments from natural language.",
    'The user may write in Polish or English (e.g. "500 na wakacje", "500 for vacation").',
    "Return ONLY valid JSON with this exact shape:",
    '{"payments":[{"goal_name":"string","amount":number}]}',
    "Use only these active goal names:",
    goalList,
    "Each amount must be a positive number. Include one payment object per goal mentioned.",
    "If a mentioned goal is not in the list, still include it using the name from the user's text.",
  ].join("\n");
}

function extractResponseText(result: unknown): string | null {
  if (typeof result !== "object" || result === null) {
    return null;
  }

  const response = (result as { response?: unknown }).response;
  if (typeof response !== "string" || !response.trim()) {
    return null;
  }

  return response.trim();
}

function extractJsonPayload(text: string): string {
  const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
  return fencedMatch ? fencedMatch[1].trim() : text;
}

export async function parseCheckInSentence(
  ai: Ai,
  text: string,
  activeGoals: ActiveGoal[],
): Promise<ParseSuccess | ParseFailure> {
  try {
    const result = await ai.run(PARSE_MODEL, {
      messages: [
        { role: "system", content: buildSystemPrompt(activeGoals.map((goal) => goal.name)) },
        { role: "user", content: text },
      ],
    });

    const responseText = extractResponseText(result);
    if (!responseText) {
      return { ok: false, reason: "invalid_response" };
    }

    let rawJson: unknown;
    try {
      rawJson = JSON.parse(extractJsonPayload(responseText));
    } catch {
      return { ok: false, reason: "invalid_response" };
    }

    const parsed = parseAiResponse(rawJson);
    if (!parsed.ok) {
      return { ok: false, reason: "invalid_response" };
    }

    const proposals: ParsedProposal[] = [];
    const unrecognized: UnrecognizedEntry[] = [];

    for (const payment of parsed.data.payments) {
      if (payment.amount <= 0) {
        continue;
      }

      const match = matchGoalName(payment.goal_name, activeGoals);
      if (match.kind === "matched") {
        proposals.push({
          goalId: match.goalId,
          goalName: match.goalName,
          amount: payment.amount,
          rawGoalName: payment.goal_name,
        });
        continue;
      }

      unrecognized.push({
        rawGoalName: payment.goal_name,
        amount: payment.amount,
      });
    }

    return { ok: true, proposals, unrecognized };
  } catch {
    return { ok: false, reason: "ai_error" };
  }
}
