import type { APIRoute } from "astro";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

type AuthContext = Parameters<APIRoute>[0];

export function redirectToSignin(context: AuthContext, message: string) {
  const url = new URL("/auth/signin", context.url);
  url.searchParams.set("error", message);
  return context.redirect(url.toString());
}

export async function redirectAfterAuth(context: AuthContext, user: User) {
  const supabase = getSupabase(context.locals, context.request.headers, context.cookies, context.url);
  if (!supabase) {
    return context.redirect("/onboarding");
  }

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return context.redirect(profile?.display_name ? "/dashboard" : "/onboarding");
}
