import type { Database } from "@/types/database";

type SavingsGoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];

export function parseGoalName(value: string | null): { ok: true; name: string } | { ok: false; error: string } {
  const name = (value ?? "").trim();
  if (name.length < 1) {
    return { ok: false, error: "Nazwa celu jest wymagana" };
  }
  if (name.length > 100) {
    return { ok: false, error: "Nazwa celu może mieć maksymalnie 100 znaków" };
  }
  return { ok: true, name };
}

export function parseTargetAmount(value: string | null): { ok: true; amount: number } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Kwota docelowa jest wymagana" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: "Kwota docelowa musi być dodatnią liczbą z maksymalnie 2 miejscami po przecinku" };
  }
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount <= 0) {
    return { ok: false, error: "Kwota docelowa musi być większa od 0" };
  }
  return { ok: true, amount };
}

export function parseSavedAmount(value: string | null): { ok: true; amount: number } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: true, amount: 0 };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: "Odłożona kwota musi być liczbą z maksymalnie 2 miejscami po przecinku" };
  }
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount < 0) {
    return { ok: false, error: "Odłożona kwota musi być 0 lub większa" };
  }
  return { ok: true, amount };
}

export function parseDeadline(
  value: string | null,
): { ok: true; deadline: string | null } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: true, deadline: null };
  }

  const yearMonthMatch = /^(\d{4})-(\d{2})$/.exec(raw);
  if (yearMonthMatch) {
    const month = Number(yearMonthMatch[2]);
    if (month < 1 || month > 12) {
      return { ok: false, error: "Nieprawidłowy miesiąc terminu" };
    }
    return { ok: true, deadline: `${yearMonthMatch[1]}-${yearMonthMatch[2]}-01` };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: "Nieprawidłowa data terminu" };
  }
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    return { ok: false, error: "Nieprawidłowa data terminu" };
  }
  return { ok: true, deadline: `${raw.slice(0, 7)}-01` };
}

export function deadlineToMonthInput(deadline: string | null): string {
  if (!deadline) return "";
  return deadline.slice(0, 7);
}

export function formatGoalRow(row: SavingsGoalRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    target_amount: row.target_amount,
    saved_amount: row.saved_amount,
    opening_saved_amount: row.opening_saved_amount,
    deadline: row.deadline,
    status: row.status,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
