import type { APIRoute } from "astro";
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
    .select("id")
    .eq("id", paymentId)
    .eq("goal_id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (paymentError || !payment) {
    return jsonResponse({ success: false, error: "Nie znaleziono wpłaty" }, 404);
  }

  const { error: deleteError } = await supabase
    .from("goal_payments")
    .delete()
    .eq("id", paymentId)
    .eq("goal_id", goalId)
    .eq("user_id", user.id);

  if (deleteError) {
    return jsonResponse({ success: false, error: "Nie udało się usunąć wpłaty" }, 500);
  }

  const recalc = await recalcSavedAmount(supabase, goalId);
  if (!recalc.ok) {
    return jsonResponse({ success: false, error: recalc.error }, 500);
  }

  return jsonResponse({ success: true });
};
