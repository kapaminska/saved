import type { AstroCookies } from "astro";
import { createClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type GoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];

export type EditGoalPageData = { kind: "redirect"; url: string } | { kind: "goal"; goal: GoalRow };

export async function getEditGoalPageData(
  requestHeaders: Headers,
  cookies: AstroCookies,
  userId: string | undefined,
  goalId: string,
): Promise<EditGoalPageData> {
  if (!userId || !goalId) {
    return { kind: "redirect", url: "/dashboard" };
  }

  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) {
    return { kind: "redirect", url: "/dashboard" };
  }

  const { data } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { kind: "redirect", url: "/dashboard" };
  }

  if (data.status !== "active") {
    return { kind: "redirect", url: "/goals/archive" };
  }

  return { kind: "goal", goal: data };
}
