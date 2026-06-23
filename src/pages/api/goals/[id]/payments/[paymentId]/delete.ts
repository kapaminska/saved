import type { APIRoute } from "astro";
import { recalcSavedAmount } from "@/lib/goals/sync-saved-amount";
import { createClient } from "@/lib/supabase";

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
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const goalId = context.params.id;
  const paymentId = context.params.paymentId;
  if (!goalId || !paymentId || !UUID_RE.test(goalId) || !UUID_RE.test(paymentId)) {
    return jsonResponse({ success: false, error: "Payment not found" }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase is not configured" }, 500);
  }

  const { data: goal, error: goalError } = await supabase
    .from("savings_goals")
    .select("id, status")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (goalError || !goal) {
    return jsonResponse({ success: false, error: "Goal not found" }, 404);
  }

  if (goal.status !== "active") {
    return jsonResponse({ success: false, error: "Only active goals can be edited" }, 409);
  }

  const { data: payment, error: paymentError } = await supabase
    .from("goal_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("goal_id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (paymentError || !payment) {
    return jsonResponse({ success: false, error: "Payment not found" }, 404);
  }

  const { error: deleteError } = await supabase
    .from("goal_payments")
    .delete()
    .eq("id", paymentId)
    .eq("goal_id", goalId)
    .eq("user_id", user.id);

  if (deleteError) {
    return jsonResponse({ success: false, error: "Failed to delete payment" }, 500);
  }

  const recalc = await recalcSavedAmount(supabase, goalId);
  if (!recalc.ok) {
    return jsonResponse({ success: false, error: recalc.error }, 500);
  }

  return jsonResponse({ success: true });
};
