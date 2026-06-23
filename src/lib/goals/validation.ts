import type { Database } from "@/types/database";

type SavingsGoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];

export function parseGoalName(value: string | null): { ok: true; name: string } | { ok: false; error: string } {
  const name = (value ?? "").trim();
  if (name.length < 1) {
    return { ok: false, error: "Goal name is required" };
  }
  if (name.length > 100) {
    return { ok: false, error: "Goal name must be at most 100 characters" };
  }
  return { ok: true, name };
}

export function parseTargetAmount(value: string | null): { ok: true; amount: number } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Target amount is required" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: "Target amount must be a positive number with at most 2 decimal places" };
  }
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount <= 0) {
    return { ok: false, error: "Target amount must be greater than 0" };
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: "Invalid deadline date" };
  }
  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) {
    return { ok: false, error: "Invalid deadline date" };
  }
  return { ok: true, deadline: raw };
}

export function formatGoalRow(row: SavingsGoalRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    target_amount: row.target_amount,
    saved_amount: row.saved_amount,
    deadline: row.deadline,
    status: row.status,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
