import type { APIRoute } from "astro";
import { getSupabase } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (supabase) {
    await supabase.auth.signOut();
  }
  return context.redirect("/");
};
