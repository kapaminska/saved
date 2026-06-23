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
              onMonthChange(e.target.value);
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
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/30 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save check-in"}
        </button>
      </div>
    </form>
  );
}
