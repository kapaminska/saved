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
    return { ok: false, error: "Payment amount is required" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: "Payment amount must be a number with at most 2 decimal places" };
  }
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount < 0) {
    return { ok: false, error: "Payment amount must be 0 or greater" };
  }
  return { ok: true, amount };
}

export function parsePaymentMonth(
  value: string | null,
): { ok: true; paymentMonth: string } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Payment month is required" };
  }

  const yearMonthMatch = /^(\d{4})-(\d{2})$/.exec(raw);
  if (yearMonthMatch) {
    const month = Number(yearMonthMatch[2]);
    if (month < 1 || month > 12) {
      return { ok: false, error: "Invalid payment month" };
    }
    return { ok: true, paymentMonth: `${yearMonthMatch[1]}-${yearMonthMatch[2]}-01` };
  }

  const parts = parseYearMonthDay(raw);
  if (!parts) {
    return { ok: false, error: "Invalid payment month" };
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
    return { ok: false, error: "Check-in month cannot be in the future" };
  }

  return monthResult;
}
