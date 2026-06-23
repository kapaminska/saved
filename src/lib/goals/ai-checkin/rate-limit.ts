import type { SavedSupabaseClient } from "@/lib/supabase";

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 3_600_000;

export async function checkRateLimit(
  supabase: SavedSupabaseClient,
  userId: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<{ ok: true; remaining: number } | { ok: false; retryAfterMs: number }> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const { count, error } = await supabase
    .from("ai_checkin_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);

  if (error) {
    return { ok: false, retryAfterMs: windowMs };
  }

  const used = count ?? 0;
  if (used >= limit) {
    const { data: oldest } = await supabase
      .from("ai_checkin_requests")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const retryAfterMs = oldest
      ? Math.max(0, windowMs - (Date.now() - new Date(oldest.created_at).getTime()))
      : windowMs;

    return { ok: false, retryAfterMs };
  }

  return { ok: true, remaining: limit - used - 1 };
}

export async function recordParseAttempt(supabase: SavedSupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("ai_checkin_requests").insert({ user_id: userId });
  if (error) {
    throw error;
  }
}
