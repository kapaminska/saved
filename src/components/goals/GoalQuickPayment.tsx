import { useState } from "react";
import { Banknote, Calendar, Plus, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  goalId: string;
  goalName: string;
  defaultMonth: string;
}

export default function GoalQuickPayment({ goalId, goalName, defaultMonth }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(defaultMonth);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpen() {
    setMonth(defaultMonth);
    setAmount("");
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const body = new URLSearchParams();
    body.set("payment_month", month);
    body.append("goal_id", goalId);
    body.append("amount", amount.trim());

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
        setError(json.error ?? "Failed to save payment");
        return;
      }

      const completed = json.completedGoals?.[0];
      if (completed) {
        window.location.assign(`/dashboard?celebrated=${completed.id}`);
        return;
      }

      window.location.reload();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex size-8 items-center justify-center rounded-lg border border-green-400/40 bg-green-900/30 text-green-200 transition-colors hover:bg-green-900/50"
        aria-label={`Add payment to ${goalName}`}
        title="Add payment"
      >
        <Plus className="size-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-payment-title"
            className="w-full max-w-sm rounded-2xl border border-white/20 bg-gradient-to-br from-purple-900/95 to-blue-900/95 p-6 text-white shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="quick-payment-title" className="text-lg font-bold text-white">
                  Add payment
                </h2>
                <p className="mt-1 text-sm text-blue-100/70">{goalName}</p>
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
                <label htmlFor={`quick-month-${goalId}`} className="mb-1 block text-sm text-blue-100/80">
                  Month
                </label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                    <Calendar className="size-4" />
                  </span>
                  <input
                    id={`quick-month-${goalId}`}
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

              <div>
                <label htmlFor={`quick-amount-${goalId}`} className="mb-1 block text-sm text-blue-100/80">
                  Amount (PLN)
                </label>
                <div className="relative">
                  <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                    <Banknote className="size-4" />
                  </span>
                  <input
                    id={`quick-amount-${goalId}`}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                    }}
                    disabled={loading}
                    placeholder="e.g. 500.00"
                    className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-white placeholder-white/40 focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>

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
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
