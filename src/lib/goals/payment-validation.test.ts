import { describe, expect, it } from "vitest";
import { parsePaymentAmount, parsePaymentMonth, validateCheckInMonth } from "./payment-validation";

describe("parsePaymentAmount", () => {
  it("accepts amounts >= 0 with at most two decimals", () => {
    expect(parsePaymentAmount("0")).toEqual({ ok: true, amount: 0 });
    expect(parsePaymentAmount("12.5")).toEqual({ ok: true, amount: 12.5 });
  });

  it("rejects empty and over-precise values", () => {
    expect(parsePaymentAmount("")).toEqual({ ok: false, error: "Kwota wpłaty jest wymagana" });
    expect(parsePaymentAmount("1.999")).toEqual({
      ok: false,
      error: "Kwota wpłaty musi być liczbą z maksymalnie 2 miejscami po przecinku",
    });
  });
});

describe("parsePaymentMonth", () => {
  it("normalizes YYYY-MM and YYYY-MM-DD to YYYY-MM-01", () => {
    expect(parsePaymentMonth("2026-03")).toEqual({ ok: true, paymentMonth: "2026-03-01" });
    expect(parsePaymentMonth("2026-03-15")).toEqual({ ok: true, paymentMonth: "2026-03-01" });
  });

  it("rejects missing and invalid months", () => {
    expect(parsePaymentMonth("")).toEqual({ ok: false, error: "Miesiąc wpłaty jest wymagany" });
    expect(parsePaymentMonth("2026-13")).toEqual({ ok: false, error: "Nieprawidłowy miesiąc wpłaty" });
    expect(parsePaymentMonth("2026-02-31")).toEqual({ ok: false, error: "Nieprawidłowy miesiąc wpłaty" });
  });
});

describe("validateCheckInMonth", () => {
  const today = new Date(2026, 2, 15);

  it("accepts the current month and past months relative to injected today", () => {
    expect(validateCheckInMonth("2026-03", today)).toEqual({ ok: true, paymentMonth: "2026-03-01" });
    expect(validateCheckInMonth("2026-02", today)).toEqual({ ok: true, paymentMonth: "2026-02-01" });
  });

  it("rejects a check-in month in the future", () => {
    expect(validateCheckInMonth("2026-04", today)).toEqual({
      ok: false,
      error: "Miesiąc check-inu nie może być w przyszłości",
    });
  });
});
