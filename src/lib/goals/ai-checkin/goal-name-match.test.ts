import { describe, expect, it } from "vitest";
import { matchGoalName } from "./goal-name-match";

const wakacje = { id: "g1", name: "Wakacje" };
const poduszka = { id: "g2", name: "Poduszka" };

describe("matchGoalName", () => {
  it("matches case- and diacritic-insensitive exact names", () => {
    expect(matchGoalName("WAKACJE", [wakacje])).toEqual({
      kind: "matched",
      goalId: "g1",
      goalName: "Wakacje",
    });
    expect(matchGoalName("poduszka", [{ id: "g2", name: "Poduszka" }])).toEqual({
      kind: "matched",
      goalId: "g2",
      goalName: "Poduszka",
    });
    expect(matchGoalName("lazienka", [{ id: "g4", name: "Łazienka" }])).toEqual({
      kind: "matched",
      goalId: "g4",
      goalName: "Łazienka",
    });
  });

  it("matches a unique substring", () => {
    expect(matchGoalName("wak", [wakacje, poduszka])).toEqual({
      kind: "matched",
      goalId: "g1",
      goalName: "Wakacje",
    });
  });

  it("matches a unique fuzzy name within the distance cap", () => {
    expect(matchGoalName("wakace", [wakacje])).toEqual({
      kind: "matched",
      goalId: "g1",
      goalName: "Wakacje",
    });
  });

  it("returns unrecognized when more than one goal matches", () => {
    expect(matchGoalName("Wakacje", [wakacje, { id: "g1b", name: "wakacje" }])).toEqual({
      kind: "unrecognized",
    });
  });

  it("returns unrecognized for an empty name or empty goal list", () => {
    expect(matchGoalName("   ", [wakacje])).toEqual({ kind: "unrecognized" });
    expect(matchGoalName("Wakacje", [])).toEqual({ kind: "unrecognized" });
  });

  // Risk #1 parse layer: similar names. Oracle is matchGoalName rules (exact → unique substring → unique fuzzy), not "whatever the code returns."
  describe("adversarial similar names", () => {
    const grecja = { id: "gA", name: "Wakacje Grecja" };
    const ogolne = { id: "gB", name: "Wakacje" };

    it("exact-matches goal B when the AI string equals B among similar names the user might mean as A", () => {
      expect(matchGoalName("Wakacje", [grecja, ogolne])).toEqual({
        kind: "matched",
        goalId: "gB",
        goalName: "Wakacje",
      });
    });

    it("fuzzy-matches the unique nearby name even when a longer similar goal is the likely intent", () => {
      expect(matchGoalName("wakace", [grecja, ogolne])).toEqual({
        kind: "matched",
        goalId: "gB",
        goalName: "Wakacje",
      });
    });
  });
});
