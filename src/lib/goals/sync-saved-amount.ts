import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type GoalRow = Database["public"]["Tables"]["savings_goals"]["Row"];

export async function recalcSavedAmount(
  supabase: SupabaseClient<Database>,
  goalId: string,
): Promise<{ ok: true; goal: GoalRow } | { ok: false; error: string }> {
  const { data: payments, error: paymentsError } = await supabase
    .from("goal_payments")
    .select("amount")
    .eq("goal_id", goalId);

  if (paymentsError) {
    return { ok: false, error: "Failed to sum payments" };
  }

  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const { data, error } = await supabase
    .from("savings_goals")
    .update({ saved_amount: total })
    .eq("id", goalId)
    .select()
    .single();

  if (error) {
    return { ok: false, error: "Failed to update saved amount" };
  }

  return { ok: true, goal: data };
}
