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

  const assetId = context.params.id;
  if (!assetId || !UUID_RE.test(assetId)) {
    return jsonResponse({ success: false, error: "Nie znaleziono aktywa" }, 404);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase nie jest skonfigurowany" }, 500);
  }

  const { data: existing, error: fetchError } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Nie znaleziono aktywa" }, 404);
  }

  const { error: deleteError } = await supabase.from("assets").delete().eq("id", assetId).eq("user_id", user.id);

  if (deleteError) {
    return jsonResponse({ success: false, error: "Nie udało się usunąć aktywa" }, 500);
  }

  return jsonResponse({ success: true });
};
