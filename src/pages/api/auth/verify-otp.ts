import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = (form.get("email") as string | null)?.trim();
  const token = (form.get("token") as string | null)?.trim();

  if (!email || !token) {
    return new Response(JSON.stringify({ success: false, error: "Email and code are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ success: false, error: "Supabase is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = data.user;
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: "Verification failed" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();

  const redirect = profile?.display_name ? "/dashboard" : "/onboarding";

  return new Response(JSON.stringify({ success: true, redirect }), {
    headers: { "Content-Type": "application/json" },
  });
};
