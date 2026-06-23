import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  goalId: string;
}

export default function AbandonGoalButton({ goalId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAbandon() {
    if (!window.confirm("Are you sure you want to abandon this goal? This cannot be undone.")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/goals/${goalId}/abandon`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to abandon goal");
        return;
      }
      window.location.href = "/goals/archive";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 border-t border-white/10 pt-6">
      <ServerError message={error} />
      <button
        type="button"
        onClick={() => {
          void handleAbandon();
        }}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-900/20 px-4 py-2 text-sm text-red-200 transition-colors hover:bg-red-900/40 disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        {loading ? "Abandoning..." : "Abandon goal"}
      </button>
    </div>
  );
}
