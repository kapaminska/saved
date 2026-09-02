import { describe, expect, it, vi } from "vitest";
import { parseCheckInSentence } from "./parse-checkin";

const goals = [
  { id: "g1", name: "Wakacje" },
  { id: "g2", name: "Poduszka" },
];

function aiWithResponse(response: unknown) {
  return { run: vi.fn().mockResolvedValue(response) } as unknown as Ai;
}

describe("parseCheckInSentence", () => {
  it("maps JSON payments onto matched and unmatched goals", async () => {
    const ai = aiWithResponse({
      response: JSON.stringify({
        payments: [
          { goal_name: "Wakacje", amount: 500 },
          { goal_name: "Nieznany", amount: 100 },
        ],
      }),
    });

    await expect(parseCheckInSentence(ai, "500 na wakacje", goals)).resolves.toEqual({
      ok: true,
      proposals: [{ goalId: "g1", goalName: "Wakacje", amount: 500, rawGoalName: "Wakacje" }],
      unrecognized: [{ rawGoalName: "Nieznany", amount: 100 }],
    });
  });

  it("strips a fenced json code block", async () => {
    const payload = JSON.stringify({ payments: [{ goal_name: "Wakacje", amount: 200 }] });
    const ai = aiWithResponse({ response: `\`\`\`json\n${payload}\n\`\`\`` });

    const result = await parseCheckInSentence(ai, "200 na wakacje", goals);
    expect(result).toEqual({
      ok: true,
      proposals: [{ goalId: "g1", goalName: "Wakacje", amount: 200, rawGoalName: "Wakacje" }],
      unrecognized: [],
    });
  });

  it("returns invalid_response for garbage model output", async () => {
    const ai = aiWithResponse({ response: "not json" });
    await expect(parseCheckInSentence(ai, "500", goals)).resolves.toEqual({
      ok: false,
      reason: "invalid_response",
    });
  });

  it("returns ai_error when the model throws", async () => {
    const ai = { run: vi.fn().mockRejectedValue(new Error("down")) } as unknown as Ai;
    await expect(parseCheckInSentence(ai, "500", goals)).resolves.toEqual({ ok: false, reason: "ai_error" });
  });
});
