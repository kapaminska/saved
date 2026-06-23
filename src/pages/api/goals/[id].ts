import type { APIRoute } from "astro";
import { formatGoalRow, parseDeadline, parseGoalName, parseTargetAmount } from "@/lib/goals/validation";
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
  if (!goalId || !UUID_RE.test(goalId)) {
    return jsonResponse({ success: false, error: "Goal not found" }, 404);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase is not configured" }, 500);
  }

  const { data: existing, error: fetchError } = await supabase
    .from("savings_goals")
    .select()
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Goal not found" }, 404);
  }

  if (existing.status !== "active") {
    return jsonResponse({ success: false, error: "Only active goals can be edited" }, 409);
  }

  const form = await context.request.formData();
  const nameResult = parseGoalName(form.get("name") as string | null);
  if (!nameResult.ok) {
    return jsonResponse({ success: false, error: nameResult.error }, 400);
  }

  const amountResult = parseTargetAmount(form.get("target_amount") as string | null);
  if (!amountResult.ok) {
    return jsonResponse({ success: false, error: amountResult.error }, 400);
  }

  const deadlineResult = parseDeadline(form.get("deadline") as string | null);
  if (!deadlineResult.ok) {
    return jsonResponse({ success: false, error: deadlineResult.error }, 400);
  }

  const { error: updateError } = await supabase
    .from("savings_goals")
    .update({
      name: nameResult.name,
      target_amount: amountResult.amount,
      deadline: deadlineResult.deadline,
    })
    .eq("id", goalId)
    .eq("user_id", user.id);

  if (updateError) {
    return jsonResponse({ success: false, error: "Failed to update goal" }, 500);
  }

  const { data: updated, error: reReadError } = await supabase
    .from("savings_goals")
    .select()
    .eq("id", goalId)
    .eq("user_id", user.id)
    .single();

  if (reReadError) {
    return jsonResponse({ success: false, error: "Failed to update goal" }, 500);
  }

  return jsonResponse({
    success: true,
    goal: formatGoalRow(updated),
    completed: updated.status === "completed",
  });
};
