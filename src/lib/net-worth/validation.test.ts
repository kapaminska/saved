import { describe, expect, it } from "vitest";
import { parseAmount, parseAssetCategory, parseName } from "./validation";

describe("parseName", () => {
  it("trims and accepts 1–100 characters", () => {
    expect(parseName("  Konto  ")).toEqual({ ok: true, name: "Konto" });
  });

  it("rejects empty and overlong names", () => {
    expect(parseName("")).toEqual({ ok: false, error: "Nazwa jest wymagana" });
    expect(parseName("x".repeat(101))).toEqual({
      ok: false,
      error: "Nazwa może mieć maksymalnie 100 znaków",
    });
  });
});

describe("parseAmount", () => {
  it("accepts amounts >= 0 with at most two decimals", () => {
    expect(parseAmount("0")).toEqual({ ok: true, amount: 0 });
    expect(parseAmount("99.99")).toEqual({ ok: true, amount: 99.99 });
  });

  it("rejects empty and invalid amounts", () => {
    expect(parseAmount("")).toEqual({ ok: false, error: "Kwota jest wymagana" });
    expect(parseAmount("1.001")).toEqual({
      ok: false,
      error: "Kwota musi być liczbą z maksymalnie 2 miejscami po przecinku",
    });
  });
});

describe("parseAssetCategory", () => {
  it("accepts known categories", () => {
    expect(parseAssetCategory("cash")).toEqual({ ok: true, category: "cash" });
    expect(parseAssetCategory("savings")).toEqual({ ok: true, category: "savings" });
  });

  it("rejects unknown categories", () => {
    expect(parseAssetCategory("crypto")).toEqual({ ok: false, error: "Nieprawidłowa kategoria aktywa" });
    expect(parseAssetCategory("")).toEqual({ ok: false, error: "Nieprawidłowa kategoria aktywa" });
  });
});
