import type { APIRoute } from "astro";
import { getSupabase } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = (form.get("email") as string | null)?.trim();

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ success: false, error: "Wymagany jest poprawny adres e-mail" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabase(context.locals, context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ success: false, error: "Supabase nie jest skonfigurowany" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limiting: Supabase enforces project-level OTP rate limits (see supabase/config.toml [auth] section)
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
