import type { APIRoute } from "astro";
import { parsePaymentAmount, validateCheckInMonth } from "@/lib/goals/payment-validation";
import { recalcSavedAmount } from "@/lib/goals/sync-saved-amount";
import { getSupabase } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return jsonResponse({ success: false, error: "Brak autoryzacji" }, 401);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase nie jest skonfigurowany" }, 500);
  }

  const form = await context.request.formData();
  const monthResult = validateCheckInMonth((form.get("payment_month") as string | null) ?? "");
  if (!monthResult.ok) {
    return jsonResponse({ success: false, error: monthResult.error }, 400);
  }

  const goalIds = form.getAll("goal_id");
  const amounts = form.getAll("amount");
  if (goalIds.length !== amounts.length) {
    return jsonResponse({ success: false, error: "Niezgodne pola celu i kwoty" }, 400);
  }

  const entries: { goalId: string; amount: number }[] = [];
  for (let i = 0; i < goalIds.length; i++) {
    const goalIdEntry = goalIds[i];
    const amountEntry = amounts[i];
    if (typeof goalIdEntry !== "string" || typeof amountEntry !== "string") {
      return jsonResponse({ success: false, error: "Nieprawidłowe pola formularza" }, 400);
    }

    const goalId = goalIdEntry;
    const amountRaw = amountEntry.trim();
    if (!amountRaw) {
      continue;
    }

    if (!UUID_RE.test(goalId)) {
      return jsonResponse({ success: false, error: "Nieprawidłowy cel" }, 400);
    }

    const amountResult = parsePaymentAmount(amountRaw);
    if (!amountResult.ok) {
      return jsonResponse({ success: false, error: amountResult.error }, 400);
    }

    entries.push({ goalId, amount: amountResult.amount });
  }

  if (entries.length === 0) {
    return jsonResponse({ success: false, error: "Brak wpłat do zapisania" }, 400);
  }

  const uniqueGoalIds = [...new Set(entries.map((entry) => entry.goalId))];
  const { data: goals, error: goalsError } = await supabase
    .from("savings_goals")
    .select("id, name, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .in("id", uniqueGoalIds);

  if (goalsError || goals.length !== uniqueGoalIds.length) {
    return jsonResponse({ success: false, error: "Nie znaleziono co najmniej jednego aktywnego celu" }, 404);
  }

  const goalById = new Map(goals.map((goal) => [goal.id, goal]));

  for (const entry of entries) {
    const { error: upsertError } = await supabase.from("goal_payments").upsert(
      {
        goal_id: entry.goalId,
        user_id: user.id,
        amount: entry.amount,
        payment_month: monthResult.paymentMonth,
      },
      { onConflict: "goal_id,payment_month" },
    );

    if (upsertError) {
      return jsonResponse({ success: false, error: "Nie udało się zapisać wpłaty" }, 500);
    }
  }

  const completedGoals: { id: string; name: string }[] = [];
  for (const goalId of uniqueGoalIds) {
    const before = goalById.get(goalId);
    if (!before) {
      continue;
    }

    const recalc = await recalcSavedAmount(supabase, goalId);
    if (!recalc.ok) {
      return jsonResponse({ success: false, error: recalc.error }, 500);
    }

    if (before.status === "active" && recalc.goal.status === "completed") {
      completedGoals.push({ id: recalc.goal.id, name: recalc.goal.name });
    }
  }

  return jsonResponse({ success: true, completedGoals });
};
