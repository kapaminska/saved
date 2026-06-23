import type { APIRoute } from "astro";
import { formatGoalRow, parseDeadline, parseGoalName, parseTargetAmount } from "@/lib/goals/validation";
import { createClient } from "@/lib/supabase";

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

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase is not configured" }, 500);
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

  const { data, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: user.id,
      name: nameResult.name,
      target_amount: amountResult.amount,
      deadline: deadlineResult.deadline,
    })
    .select()
    .single();

  if (error) {
    return jsonResponse({ success: false, error: "Failed to create goal" }, 500);
  }

  return jsonResponse({ success: true, goal: formatGoalRow(data) });
};
