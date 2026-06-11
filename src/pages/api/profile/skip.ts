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

  await supabase.from("profiles").update({ display_name: emailPrefix }).eq("id", user.id);

  return context.redirect("/dashboard");
};
