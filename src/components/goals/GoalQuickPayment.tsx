import { useState } from "react";
import { Banknote, Calendar, Plus, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  goalId: string;
  goalName: string;
  defaultMonth: string;
}

const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring w-full rounded-lg border px-3 py-2 pl-10 focus:ring-2 focus:outline-none disabled:opacity-50";

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
      const json: {
        success: boolean;
        error?: string;
        completedGoals?: { id: string; name: string }[];
      } = await res.json();

      if (!json.success) {
        setError(json.error ?? "Nie udało się zapisać wpłaty");
        return;
      }

      const completed = json.completedGoals?.[0];
      if (completed) {
        window.location.assign(`/dashboard?celebrated=${completed.id}`);
        return;
      }

      window.location.reload();
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex size-8 items-center justify-center rounded-lg border border-green-200 bg-green-100 text-green-800 transition-colors hover:bg-green-200"
        aria-label={`Dodaj wpłatę do ${goalName}`}
        title="Dodaj wpłatę"
      >
        <Plus className="size-4" />
      </button>

      {open && (
        <div className="bg-foreground/20 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-payment-title"
            className="border-border bg-card w-full max-w-sm rounded-2xl border p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="quick-payment-title" className="text-foreground text-lg font-bold">
                  Dodaj wpłatę
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">{goalName}</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-1 transition-colors disabled:opacity-50"
                aria-label="Zamknij"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor={`quick-month-${goalId}`} className="text-foreground mb-1 block text-sm">
                  Miesiąc
                </label>
                <div className="relative">
                  <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
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
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`quick-amount-${goalId}`} className="text-foreground mb-1 block text-sm">
                  Kwota (PLN)
                </label>
                <div className="relative">
                  <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
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
                    placeholder="np. 500.00"
                    className={inputClass}
                  />
                </div>
              </div>

              <ServerError message={error} />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="border-border text-muted-foreground hover:bg-accent flex-1 rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-50"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? "Zapisywanie..." : "Zapisz"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
