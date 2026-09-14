import type { APIRoute } from "astro";
import { redirectAfterAuth, redirectToSignin } from "@/lib/auth-redirect";
import { formatAuthError, getSupabase, supabaseUnavailableMessage } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = (form.get("email") as string | null)?.trim();
  const token = (form.get("token") as string | null)?.trim();

  if (!email || !token) {
    return redirectToSignin(context, "Wymagany jest adres e-mail i kod");
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies, context.url);
  if (!supabase) {
    return redirectToSignin(context, supabaseUnavailableMessage(context.url));
  }

  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return redirectToSignin(context, formatAuthError(error, "Weryfikacja nie powiodła się"));
  }

  const user = data.user;
  if (!user) {
    return redirectToSignin(context, "Weryfikacja nie powiodła się");
  }

  return redirectAfterAuth(context, user);
};
