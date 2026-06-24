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

  const goalId = context.params.id;
  const paymentId = context.params.paymentId;
  if (!goalId || !paymentId || !UUID_RE.test(goalId) || !UUID_RE.test(paymentId)) {
    return jsonResponse({ success: false, error: "Nie znaleziono wpłaty" }, 404);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase nie jest skonfigurowany" }, 500);
  }

  const { data: goal, error: goalError } = await supabase
    .from("savings_goals")
    .select("id, status")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (goalError || !goal) {
    return jsonResponse({ success: false, error: "Nie znaleziono celu" }, 404);
  }

  if (goal.status !== "active") {
    return jsonResponse({ success: false, error: "Tylko aktywne cele można edytować" }, 409);
  }

  const { data: payment, error: paymentError } = await supabase
    .from("goal_payments")
    .select("id, payment_month")
    .eq("id", paymentId)
    .eq("goal_id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (paymentError || !payment) {
    return jsonResponse({ success: false, error: "Nie znaleziono wpłaty" }, 404);
  }

  const form = await context.request.formData();
  const amountResult = parsePaymentAmount(form.get("amount") as string | null);
  if (!amountResult.ok) {
    return jsonResponse({ success: false, error: amountResult.error }, 400);
  }

  const monthResult = validateCheckInMonth((form.get("payment_month") as string | null) ?? "");
  if (!monthResult.ok) {
    return jsonResponse({ success: false, error: monthResult.error }, 400);
  }

  if (monthResult.paymentMonth !== payment.payment_month) {
    const { data: conflict } = await supabase
      .from("goal_payments")
      .select("id")
      .eq("goal_id", goalId)
      .eq("payment_month", monthResult.paymentMonth)
      .neq("id", paymentId)
      .maybeSingle();

    if (conflict) {
      return jsonResponse({ success: false, error: "Wpłata na ten miesiąc już istnieje" }, 409);
    }
  }

  const { error: updateError } = await supabase
    .from("goal_payments")
    .update({
      amount: amountResult.amount,
      payment_month: monthResult.paymentMonth,
    })
    .eq("id", paymentId)
    .eq("goal_id", goalId)
    .eq("user_id", user.id);

  if (updateError) {
    return jsonResponse({ success: false, error: "Nie udało się zaktualizować wpłaty" }, 500);
  }

  const recalc = await recalcSavedAmount(supabase, goalId);
  if (!recalc.ok) {
    return jsonResponse({ success: false, error: recalc.error }, 500);
  }

  return jsonResponse({
    success: true,
    completed: recalc.goal.status === "completed",
  });
};
