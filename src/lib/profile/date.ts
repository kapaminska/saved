/** Normalize DB / ISO date strings for `<input type="date">` (YYYY-MM-DD). */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? "";
}

export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return value <= today;
}

export function validateDateOfBirth(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!isValidDateInput(trimmed)) return "Enter a valid date (use the calendar picker)";
  return undefined;
}

/** Server-side date_of_birth validation (YYYY-MM-DD, 1900–today). */
export function parseDateOfBirth(
  value: string | null,
): { ok: true; date: string | null } | { ok: false; error: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { ok: true, date: null };
  if (!isValidDateInput(trimmed)) {
    return { ok: false, error: "Invalid date of birth" };
  }
  return { ok: true, date: trimmed };
}
