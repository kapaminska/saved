import { describe, expect, it } from "vitest";
import { parseDeadline, parseGoalName, parseSavedAmount, parseTargetAmount } from "./validation";

describe("parseGoalName", () => {
  it("accepts a trimmed name of 1–100 characters", () => {
    expect(parseGoalName("  Wakacje  ")).toEqual({ ok: true, name: "Wakacje" });
    expect(parseGoalName("a")).toEqual({ ok: true, name: "a" });
    expect(parseGoalName("x".repeat(100))).toEqual({ ok: true, name: "x".repeat(100) });
  });

  it("rejects empty and overlong names", () => {
    expect(parseGoalName("")).toEqual({ ok: false, error: "Nazwa celu jest wymagana" });
    expect(parseGoalName("   ")).toEqual({ ok: false, error: "Nazwa celu jest wymagana" });
    expect(parseGoalName("x".repeat(101))).toEqual({
      ok: false,
      error: "Nazwa celu może mieć maksymalnie 100 znaków",
    });
  });
});

describe("parseTargetAmount", () => {
  it("accepts a positive amount with up to two decimals", () => {
    expect(parseTargetAmount("10")).toEqual({ ok: true, amount: 10 });
    expect(parseTargetAmount("10.5")).toEqual({ ok: true, amount: 10.5 });
    expect(parseTargetAmount("10.50")).toEqual({ ok: true, amount: 10.5 });
  });

  it("rejects missing, non-numeric, and non-positive amounts", () => {
    expect(parseTargetAmount("")).toEqual({ ok: false, error: "Kwota docelowa jest wymagana" });
    expect(parseTargetAmount("10.555")).toEqual({
      ok: false,
      error: "Kwota docelowa musi być dodatnią liczbą z maksymalnie 2 miejscami po przecinku",
    });
    expect(parseTargetAmount("0")).toEqual({ ok: false, error: "Kwota docelowa musi być większa od 0" });
  });
});

describe("parseSavedAmount", () => {
  it("defaults empty to 0 and accepts amounts >= 0", () => {
    expect(parseSavedAmount("")).toEqual({ ok: true, amount: 0 });
    expect(parseSavedAmount("0")).toEqual({ ok: true, amount: 0 });
    expect(parseSavedAmount("12.30")).toEqual({ ok: true, amount: 12.3 });
  });

  it("rejects invalid formats", () => {
    expect(parseSavedAmount("1.234")).toEqual({
      ok: false,
      error: "Odłożona kwota musi być liczbą z maksymalnie 2 miejscami po przecinku",
    });
  });
});

describe("parseDeadline", () => {
  it("returns null for an empty value", () => {
    expect(parseDeadline("")).toEqual({ ok: true, deadline: null });
    expect(parseDeadline(null)).toEqual({ ok: true, deadline: null });
  });

  it("normalizes YYYY-MM and YYYY-MM-DD to the first of the month", () => {
    expect(parseDeadline("2026-06")).toEqual({ ok: true, deadline: "2026-06-01" });
    expect(parseDeadline("2026-06-30")).toEqual({ ok: true, deadline: "2026-06-01" });
  });

  it("rejects an invalid month or date", () => {
    expect(parseDeadline("2026-13")).toEqual({ ok: false, error: "Nieprawidłowy miesiąc terminu" });
    expect(parseDeadline("not-a-date")).toEqual({ ok: false, error: "Nieprawidłowa data terminu" });
  });
});
