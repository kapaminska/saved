import type { APIRoute } from "astro";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirectAfterAuth, redirectToSignin } from "@/lib/auth-redirect";
import { getSupabase, supabaseUnavailableMessage } from "@/lib/supabase";

function isEmailOtpType(value: string | null): value is EmailOtpType {
  switch (value) {
    case "signup":
    case "invite":
    case "magiclink":
    case "recovery":
    case "email_change":
    case "email":
      return true;
    default:
      return false;
  }
}

export const GET: APIRoute = async (context) => {
  const supabase = getSupabase(context.locals, context.request.headers, context.cookies, context.url);
  if (!supabase) {
    return redirectToSignin(context, supabaseUnavailableMessage(context.url));
  }

  const tokenHash = context.url.searchParams.get("token_hash");
  const type = context.url.searchParams.get("type");
  const code = context.url.searchParams.get("code");

  if (tokenHash && isEmailOtpType(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return redirectAfterAuth(context, data.user);
    }
    return redirectToSignin(context, "Link logowania jest nieprawidłowy lub wygasł");
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectAfterAuth(context, data.user);
    }
    return redirectToSignin(context, "Link logowania jest nieprawidłowy lub wygasł");
  }

  return redirectToSignin(context, "Link logowania jest nieprawidłowy lub wygasł");
};
