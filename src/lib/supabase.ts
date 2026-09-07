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

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    return isLoopbackHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function formatAuthError(error: { message?: string } | null | undefined, fallback: string): string {
  const msg = error?.message?.trim();
  if (msg && msg !== "{}" && msg !== "[object Object]") {
    return msg;
  }
  return fallback;
}

export function supabaseUnavailableMessage(requestUrl?: URL): string {
  if (requestUrl && SUPABASE_URL && isLocalSupabaseUrl(SUPABASE_URL) && !isLoopbackHostname(requestUrl.hostname)) {
    // eslint-disable-next-line no-console -- operator diagnostic; never sent to the client
    console.warn(
      "Production request is using a loopback SUPABASE_URL. Set Worker secrets SUPABASE_URL and SUPABASE_KEY to the hosted project.",
    );
  }
  return "Supabase nie jest skonfigurowany";
}

export function createClient(
  requestHeaders: Headers,
  cookies: AstroCookies,
  requestUrl?: URL,
): SavedSupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  if (requestUrl && isLocalSupabaseUrl(SUPABASE_URL) && !isLoopbackHostname(requestUrl.hostname)) {
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
  _requestHeaders: Headers,
  _cookies: AstroCookies,
  _requestUrl?: URL,
): SavedSupabaseClient | null {
  // Middleware always assigns this (client or null). Do not `?? createClient`:
  // null from the local-URL guard would otherwise recreate an unguarded client.
  return locals.supabase;
}
