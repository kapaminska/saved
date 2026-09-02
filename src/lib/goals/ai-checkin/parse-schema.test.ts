import { describe, expect, it } from "vitest";
import { parseAiResponse } from "./parse-schema";

describe("parseAiResponse", () => {
  it("accepts a payments array with positive amounts", () => {
    expect(parseAiResponse({ payments: [{ goal_name: "Wakacje", amount: 500 }] })).toEqual({
      ok: true,
      data: { payments: [{ goal_name: "Wakacje", amount: 500 }] },
    });
  });

  it("coerces numeric strings", () => {
    expect(parseAiResponse({ payments: [{ goal_name: "Wakacje", amount: "12.5" }] })).toEqual({
      ok: true,
      data: { payments: [{ goal_name: "Wakacje", amount: 12.5 }] },
    });
  });

  it("fails closed on invalid payloads", () => {
    expect(parseAiResponse({})).toEqual({ ok: false });
    expect(parseAiResponse({ payments: [{ goal_name: "", amount: 10 }] })).toEqual({ ok: false });
    expect(parseAiResponse({ payments: [{ goal_name: "Wakacje", amount: 0 }] })).toEqual({ ok: false });
  });
});
