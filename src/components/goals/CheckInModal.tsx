import { useState } from "react";
import { Banknote, Calendar, ClipboardCheck, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";

interface CheckInGoal {
  id: string;
  name: string;
}

interface Props {
  goals: CheckInGoal[];
  defaultMonth: string;
}

export default function CheckInModal({ goals, defaultMonth }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpen() {
    setMonth(defaultMonth);
    setAmounts({});
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
  }

  function setZero(goalId: string) {
    setAmounts((prev) => ({ ...prev, [goalId]: "0" }));
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body = new URLSearchParams();
    body.set("payment_month", month);

    let hasPayment = false;
    for (const goal of goals) {
      const raw = (amounts[goal.id] ?? "").trim();
      if (!raw) continue;
      body.append("goal_id", goal.id);
      body.append("amount", raw);
      hasPayment = true;
    }

    if (!hasPayment) {
      setError("Enter an amount for at least one goal, or use 0 to record no savings.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        completedGoals?: { id: string; name: string }[];
      };

      if (!json.success) {
        setError(json.error ?? "Failed to save check-in");
        return;
      }

      const completed = json.completedGoals?.[0];
      if (completed) {
        window.location.href = `/dashboard?celebrated=${completed.id}`;
        return;
      }

      window.location.reload();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (goals.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-400/40 bg-blue-900/30 px-3 py-1.5 text-sm text-blue-200 transition-colors hover:bg-blue-900/50"
      >
        <ClipboardCheck className="size-4" />
        Check in
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/20 bg-gradient-to-br from-purple-900/95 to-blue-900/95 p-6 text-white shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="checkin-title" className="text-xl font-bold text-white">
                  Monthly check-in
                </h2>
                <p className="mt-1 text-sm text-blue-100/70">
                  Record what you saved this month. Leave a field empty to skip a goal.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-lg p-1 text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="payment_month" className="mb-1 block text-sm text-blue-100/80">
                  Month
                </label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                    <Calendar className="size-4" />
                  </span>
                  <input
                    id="payment_month"
                    name="payment_month"
                    type="month"
                    value={month}
                    max={defaultMonth}
                    onChange={(e) => {
                      setMonth(e.target.value);
                    }}
                    disabled={loading}
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              <ul className="space-y-3">
                {goals.map((goal) => (
                  <li key={goal.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white">{goal.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setZero(goal.id);
                        }}
                        disabled={loading}
                        className="shrink-0 rounded border border-white/20 px-2 py-0.5 text-xs text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                      >
                        0
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                        <Banknote className="size-4" />
                      </span>
                      <input
                        id={`amount-${goal.id}`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="Skip if empty"
                        value={amounts[goal.id] ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAmounts((prev) => ({ ...prev, [goal.id]: value }));
                        }}
                        disabled={loading}
                        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <ServerError message={error} />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm text-blue-100/80 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/30 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save check-in"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
