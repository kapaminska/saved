import type { APIRoute } from "astro";
import { getSupabase } from "@/lib/supabase";

function redirectWithError(context: Parameters<APIRoute>[0], message: string) {
  const url = new URL("/auth/signin", context.url);
  url.searchParams.set("error", message);
  return context.redirect(url.toString());
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = (form.get("email") as string | null)?.trim();
  const token = (form.get("token") as string | null)?.trim();

  if (!email || !token) {
    return redirectWithError(context, "Wymagany jest adres e-mail i kod");
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return redirectWithError(context, "Supabase nie jest skonfigurowany");
  }

  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return redirectWithError(context, error.message);
  }

  const user = data.user;
  if (!user) {
    return redirectWithError(context, "Weryfikacja nie powiodła się");
  }

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();

  const redirect = profile?.display_name ? "/dashboard" : "/onboarding";
  return context.redirect(redirect);
};
