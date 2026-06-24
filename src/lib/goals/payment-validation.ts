function parseYearMonthDay(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function parsePaymentAmount(value: string | null): { ok: true; amount: number } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Kwota wpłaty jest wymagana" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: "Kwota wpłaty musi być liczbą z maksymalnie 2 miejscami po przecinku" };
  }
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount < 0) {
    return { ok: false, error: "Kwota wpłaty musi być 0 lub większa" };
  }
  return { ok: true, amount };
}

export function parsePaymentMonth(
  value: string | null,
): { ok: true; paymentMonth: string } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Miesiąc wpłaty jest wymagany" };
  }

  const yearMonthMatch = /^(\d{4})-(\d{2})$/.exec(raw);
  if (yearMonthMatch) {
    const month = Number(yearMonthMatch[2]);
    if (month < 1 || month > 12) {
      return { ok: false, error: "Nieprawidłowy miesiąc wpłaty" };
    }
    return { ok: true, paymentMonth: `${yearMonthMatch[1]}-${yearMonthMatch[2]}-01` };
  }

  const parts = parseYearMonthDay(raw);
  if (!parts) {
    return { ok: false, error: "Nieprawidłowy miesiąc wpłaty" };
  }

  const month = String(parts.month).padStart(2, "0");
  return { ok: true, paymentMonth: `${parts.year}-${month}-01` };
}

export function validateCheckInMonth(
  month: string,
  today: Date = new Date(),
): { ok: true; paymentMonth: string } | { ok: false; error: string } {
  const monthResult = parsePaymentMonth(month);
  if (!monthResult.ok) {
    return monthResult;
  }

  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const paymentYear = Number(monthResult.paymentMonth.slice(0, 4));
  const paymentMonth = Number(monthResult.paymentMonth.slice(5, 7));

  if (paymentYear > currentYear || (paymentYear === currentYear && paymentMonth > currentMonth)) {
    return { ok: false, error: "Miesiąc check-inu nie może być w przyszłości" };
  }

  return monthResult;
}
