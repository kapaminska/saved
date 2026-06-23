declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    profile: import("@/types/database").Database["public"]["Tables"]["profiles"]["Row"] | null;
    supabase: import("@/lib/supabase").SavedSupabaseClient | null;
  }
}

// Workers AI and other bindings: import { env } from "cloudflare:workers" in API routes (env.AI).
