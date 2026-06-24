import type { APIRoute } from "astro";
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
  if (!goalId || !UUID_RE.test(goalId)) {
    return jsonResponse({ success: false, error: "Nie znaleziono celu" }, 404);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase nie jest skonfigurowany" }, 500);
  }

  const { data: existing, error: fetchError } = await supabase
    .from("savings_goals")
    .select("status")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Nie znaleziono celu" }, 404);
  }

  if (existing.status !== "active") {
    return jsonResponse({ success: false, error: "Tylko aktywne cele można porzucić" }, 409);
  }

  const { error: updateError } = await supabase
    .from("savings_goals")
    .update({ status: "abandoned" })
    .eq("id", goalId)
    .eq("user_id", user.id);

  if (updateError) {
    return jsonResponse({ success: false, error: "Nie udało się porzucić celu" }, 500);
  }

  return jsonResponse({ success: true });
};
