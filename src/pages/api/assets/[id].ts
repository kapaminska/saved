import type { APIRoute } from "astro";
import { formatAssetRow, parseAmount, parseAssetCategory, parseName } from "@/lib/net-worth/validation";
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
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const assetId = context.params.id;
  if (!assetId || !UUID_RE.test(assetId)) {
    return jsonResponse({ success: false, error: "Asset not found" }, 404);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase is not configured" }, 500);
  }

  const { data: existing, error: fetchError } = await supabase
    .from("assets")
    .select()
    .eq("id", assetId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Asset not found" }, 404);
  }

  const form = await context.request.formData();
  const nameResult = parseName(form.get("name") as string | null);
  if (!nameResult.ok) {
    return jsonResponse({ success: false, error: nameResult.error }, 400);
  }

  const amountResult = parseAmount(form.get("amount") as string | null);
  if (!amountResult.ok) {
    return jsonResponse({ success: false, error: amountResult.error }, 400);
  }

  const categoryResult = parseAssetCategory(form.get("category") as string | null);
  if (!categoryResult.ok) {
    return jsonResponse({ success: false, error: categoryResult.error }, 400);
  }

  const { data, error } = await supabase
    .from("assets")
    .update({
      name: nameResult.name,
      amount: amountResult.amount,
      category: categoryResult.category,
      last_updated_at: new Date().toISOString(),
    })
    .eq("id", assetId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return jsonResponse({ success: false, error: "Failed to update asset" }, 500);
  }

  return jsonResponse({ success: true, asset: formatAssetRow(data) });
};
