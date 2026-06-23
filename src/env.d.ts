declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    profile: import("@/types/database").Database["public"]["Tables"]["profiles"]["Row"] | null;
    supabase: import("@/lib/supabase").SavedSupabaseClient | null;
  }
}
