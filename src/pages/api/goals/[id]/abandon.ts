import type { APIRoute } from "astro";
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
    .select("status")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Goal not found" }, 404);
  }

  if (existing.status !== "active") {
    return jsonResponse({ success: false, error: "Only active goals can be abandoned" }, 409);
  }

  const { error: updateError } = await supabase
    .from("savings_goals")
    .update({ status: "abandoned" })
    .eq("id", goalId)
    .eq("user_id", user.id);

  if (updateError) {
    return jsonResponse({ success: false, error: "Failed to abandon goal" }, 500);
  }

  return jsonResponse({ success: true });
};
