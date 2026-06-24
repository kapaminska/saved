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
    if (!window.confirm("Czy na pewno chcesz porzucić ten cel? Tej operacji nie można cofnąć.")) {
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
        setError(json.error ?? "Nie udało się porzucić celu");
        return;
      }
      window.location.href = "/goals/archive";
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-border mt-8 border-t pt-6">
      <ServerError message={error} />
      <button
        type="button"
        onClick={() => {
          void handleAbandon();
        }}
        disabled={loading}
        className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-50"
      >
        <Trash2 className="size-4" />
        {loading ? "Porzucanie..." : "Porzuć cel"}
      </button>
    </div>
  );
}
