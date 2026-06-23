const MAX_CHECKIN_TEXT_LENGTH = 500;

export function validateCheckInText(text: string): { ok: true; text: string } | { ok: false; error: string } {
  const trimmed = text.trim();

  if (!trimmed) {
    return { ok: false, error: "Check-in text cannot be empty" };
  }

  if (trimmed.length > MAX_CHECKIN_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Check-in text must be ${MAX_CHECKIN_TEXT_LENGTH} characters or fewer`,
    };
  }

  return { ok: true, text: trimmed };
}
