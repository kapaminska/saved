const MAX_CHECKIN_TEXT_LENGTH = 500;

export function validateCheckInText(text: string): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = text.trim();

  if (!trimmed) {
    return { ok: false, error: "Tekst check-inu nie może być pusty" };
  }

  if (trimmed.length > MAX_CHECKIN_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Tekst check-inu może mieć maksymalnie ${MAX_CHECKIN_TEXT_LENGTH} znaków`,
    };
  }

  return { ok: true, text: trimmed };
}
