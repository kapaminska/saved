import type { AstroCookies } from "astro";
import { createClient, type SavedSupabaseClient } from "@/lib/supabase";
import { computeGoalMetrics, type GoalMetrics } from "@/lib/goals/projection";
import type { Database } from "@/types/database";

type GoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];
type PaymentRow = Database["public"]["Tables"]["goal_payments"]["Row"];

export type GoalDetailPageData =
  | { kind: "redirect"; url: string }
  | {
      kind: "goal";
      goal: GoalRow;
      payments: PaymentRow[];
      metrics: GoalMetrics;
      editable: boolean;
    };

function resolveSupabase(
  supabaseFromLocals: SavedSupabaseClient | null | undefined,
  requestHeaders: Headers,
  cookies: AstroCookies,
): SavedSupabaseClient | null {
  if (supabaseFromLocals) {
    return supabaseFromLocals;
  }
  return createClient(requestHeaders, cookies);
}

export async function getGoalDetailPageData(
  supabaseFromLocals: SavedSupabaseClient | null | undefined,
  requestHeaders: Headers,
  cookies: AstroCookies,
  userId: string | undefined,
  goalId: string,
): Promise<GoalDetailPageData> {
  if (!userId || !goalId) {
    return { kind: "redirect", url: "/dashboard" };
  }

  const supabase = resolveSupabase(supabaseFromLocals, requestHeaders, cookies);
  if (!supabase) {
    return { kind: "redirect", url: "/dashboard" };
  }

  const { data: goal } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("id", goalId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!goal) {
    return { kind: "redirect", url: "/dashboard" };
  }

  const { data: payments } = await supabase
    .from("goal_payments")
    .select("*")
    .eq("goal_id", goalId)
    .order("payment_month", { ascending: false });

  const metrics = computeGoalMetrics(goal, payments ?? []);

  return {
    kind: "goal",
    goal,
    payments: payments ?? [],
    metrics,
    editable: goal.status === "active",
  };
}
