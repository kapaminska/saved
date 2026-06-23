import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Database } from "@/types/database";

export type SavedSupabaseClient = SupabaseClient<Database>;

function cookieDefaults(options?: Parameters<AstroCookies["set"]>[2]) {
  return {
    ...options,
    path: options?.path ?? "/",
    sameSite: options?.sameSite ?? ("lax" as const),
  };
}

export function createClient(requestHeaders: Headers, cookies: AstroCookies): SavedSupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  const cookieOverrides = new Map<string, string | null>();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        const merged = new Map<string, string>();
        for (const { name, value } of parseCookieHeader(requestHeaders.get("Cookie") ?? "")) {
          merged.set(name, value ?? "");
        }
        for (const [name, value] of cookieOverrides) {
          if (value === null) {
            merged.delete(name);
          } else {
            merged.set(name, value);
          }
        }
        return Array.from(merged.entries()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const opts = cookieDefaults(options);
          if (!value) {
            cookieOverrides.set(name, null);
            cookies.delete(name, opts);
          } else {
            cookieOverrides.set(name, value);
            cookies.set(name, value, opts);
          }
        });
      },
    },
  });
}

export function getSupabase(
  locals: App.Locals,
  requestHeaders: Headers,
  cookies: AstroCookies,
): SavedSupabaseClient | null {
  return locals.supabase ?? createClient(requestHeaders, cookies);
}
