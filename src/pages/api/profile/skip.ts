import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin");
  }

  const emailPrefix = user.email?.split("@")[0] ?? "User";

  const { error } = await supabase.from("profiles").update({ display_name: emailPrefix }).eq("id", user.id);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: "Failed to skip onboarding" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return context.redirect("/dashboard");
};
