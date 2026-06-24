import { useState } from "react";
import { Banknote, Calendar } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";

interface CheckInGoal {
  id: string;
  name: string;
}

interface Props {
  goals: CheckInGoal[];
  month: string;
  defaultMonth: string;
  onMonthChange: (month: string) => void;
  loading: boolean;
  error: string | null;
  onSubmit: (data: { month: string; amounts: Record<string, string> }) => void;
}

const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring w-full rounded-lg border px-3 py-2 pl-10 focus:ring-2 focus:outline-none disabled:opacity-50";

export default function ManualCheckInForm({
  goals,
  month,
  defaultMonth,
  onMonthChange,
  loading,
  error,
  onSubmit,
}: Props) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  function setZero(goalId: string) {
    setAmounts((prev) => ({ ...prev, [goalId]: "0" }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({ month, amounts });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="payment_month" className="text-foreground mb-1 block text-sm">
          Month
        </label>
        <div className="relative">
          <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
            <Calendar className="size-4" />
          </span>
          <input
            id="payment_month"
            name="payment_month"
            type="month"
            value={month}
            max={defaultMonth}
            onChange={(e) => {
              onMonthChange(e.target.value);
            }}
            disabled={loading}
            className={inputClass}
          />
        </div>
      </div>

      <ul className="space-y-3">
        {goals.map((goal) => (
          <li key={goal.id} className="border-border bg-muted/50 rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-foreground text-sm font-medium">{goal.name}</span>
              <button
                type="button"
                onClick={() => {
                  setZero(goal.id);
                }}
                disabled={loading}
                className="border-border text-muted-foreground hover:bg-accent shrink-0 rounded border px-2 py-0.5 text-xs transition-colors disabled:opacity-50"
              >
                0
              </button>
            </div>
            <div className="relative">
              <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
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
                className={inputClass}
              />
            </div>
          </li>
        ))}
      </ul>

      <ServerError message={error} />

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save check-in"}
        </button>
      </div>
    </form>
  );
}
