import type { APIRoute } from "astro";
import { formatLiabilityRow, parseAmount, parseName } from "@/lib/net-worth/validation";
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

  const liabilityId = context.params.id;
  if (!liabilityId || !UUID_RE.test(liabilityId)) {
    return jsonResponse({ success: false, error: "Liability not found" }, 404);
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ success: false, error: "Supabase is not configured" }, 500);
  }

  const { data: existing, error: fetchError } = await supabase
    .from("liabilities")
    .select()
    .eq("id", liabilityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !existing) {
    return jsonResponse({ success: false, error: "Liability not found" }, 404);
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

  const { data, error } = await supabase
    .from("liabilities")
    .update({
      name: nameResult.name,
      amount: amountResult.amount,
    })
    .eq("id", liabilityId)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return jsonResponse({ success: false, error: "Failed to update liability" }, 500);
  }

  return jsonResponse({ success: true, liability: formatLiabilityRow(data) });
};
