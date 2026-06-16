import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/profile"];

const ONBOARDING_EXEMPT = new Set(["/onboarding", "/api/profile", "/api/profile/skip", "/api/auth/signout"]);

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  context.locals.profile = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      context.locals.profile = profile ?? null;
    }
  } else {
    context.locals.user = null;
  }

  const { pathname } = context.url;

  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }

    if (!context.locals.profile?.display_name && !ONBOARDING_EXEMPT.has(pathname)) {
      return context.redirect("/onboarding");
    }
  }

  return next();
});
