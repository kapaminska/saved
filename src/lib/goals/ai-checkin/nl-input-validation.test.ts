import { describe, expect, it } from "vitest";
import { validateCheckInText } from "./nl-input-validation";

describe("validateCheckInText", () => {
  it("trims a non-empty sentence within 500 characters", () => {
    expect(validateCheckInText("  500 na wakacje  ")).toEqual({ ok: true, text: "500 na wakacje" });
  });

  it("rejects empty text", () => {
    expect(validateCheckInText("   ")).toEqual({
      ok: false,
      error: "Tekst check-inu nie może być pusty",
    });
  });

  it("rejects text longer than 500 characters", () => {
    expect(validateCheckInText("x".repeat(501))).toEqual({
      ok: false,
      error: "Tekst check-inu może mieć maksymalnie 500 znaków",
    });
  });
});
