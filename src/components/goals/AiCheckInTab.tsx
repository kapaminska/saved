import { useState } from "react";
import { AlertTriangle, Banknote, Calendar, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";

const MAX_TEXT_LENGTH = 500;

interface CheckInGoal {
  id: string;
  name: string;
}

interface ParsedProposal {
  goalId: string;
  goalName: string;
  amount: number;
  rawGoalName: string;
}

interface UnrecognizedEntry {
  rawGoalName: string;
  amount: number;
}

interface ReviewProposal {
  id: string;
  goalId: string;
  amount: string;
}

interface Props {
  goals: CheckInGoal[];
  month: string;
  defaultMonth: string;
  onMonthChange: (month: string) => void;
  onSwitchToManual: () => void;
}

type View = "input" | "review";

function validateInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Check-in text cannot be empty";
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return `Check-in text must be ${MAX_TEXT_LENGTH} characters or fewer`;
  }
  return null;
}

function createReviewProposals(proposals: ParsedProposal[]): ReviewProposal[] {
  return proposals.map((proposal, index) => ({
    id: `${proposal.goalId}-${index}`,
    goalId: proposal.goalId,
    amount: String(proposal.amount),
  }));
}

const inputClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring w-full rounded-lg border px-3 py-2 focus:ring-2 focus:outline-none disabled:opacity-50";

export default function AiCheckInTab({ goals, month, defaultMonth, onMonthChange, onSwitchToManual }: Props) {
  const [view, setView] = useState<View>("input");
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviewProposals, setReviewProposals] = useState<ReviewProposal[]>([]);
  const [unrecognized, setUnrecognized] = useState<UnrecognizedEntry[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleParse(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationError = validateInput(text);
    if (validationError) {
      setInputError(validationError);
      return;
    }

    setLoading(true);
    setInputError(null);
    setServerError(null);
    setShowFallback(false);

    try {
      const res = await fetch("/api/check-in/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const json: {
        success: boolean;
        error?: string;
        code?: string;
        proposals?: ParsedProposal[];
        unrecognized?: UnrecognizedEntry[];
      } = await res.json();

      if (!json.success) {
        if (json.code === "INVALID_INPUT") {
          setInputError(json.error ?? "Invalid check-in text");
          return;
        }
        if (json.code === "RATE_LIMITED" || json.code === "AI_UNAVAILABLE") {
          setServerError(json.error ?? "AI check-in is unavailable");
          setShowFallback(true);
          return;
        }
        setServerError(json.error ?? "Failed to parse check-in");
        return;
      }

      setReviewProposals(createReviewProposals(json.proposals ?? []));
      setUnrecognized(json.unrecognized ?? []);
      setView("review");
    } catch {
      setServerError("Network error. Please try again.");
      setShowFallback(true);
    } finally {
      setLoading(false);
    }
  }

  function updateProposal(id: string, patch: Partial<Pick<ReviewProposal, "goalId" | "amount">>) {
    setReviewProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removeProposal(id: string) {
    setReviewProposals((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSaveReview() {
    setLoading(true);
    setSaveError(null);

    const body = new URLSearchParams();
    body.set("payment_month", month);

    let paymentCount = 0;
    for (const proposal of reviewProposals) {
      const amountRaw = proposal.amount.trim();
      if (!amountRaw) continue;
      body.append("goal_id", proposal.goalId);
      body.append("amount", amountRaw);
      paymentCount++;
    }

    if (paymentCount === 0) {
      setSaveError("Enter an amount for at least one proposal.");
      setLoading(false);
      return;
    }

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
        setSaveError(json.error ?? "Failed to save check-in");
        return;
      }

      const completed = json.completedGoals?.[0];
      if (completed) {
        window.location.href = `/dashboard?celebrated=${completed.id}`;
        return;
      }

      window.location.reload();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (view === "review") {
    return (
      <div className="space-y-4">
        {reviewProposals.length > 0 && (
          <ul className="space-y-3">
            {reviewProposals.map((proposal) => (
              <li key={proposal.id} className="border-border bg-muted/50 rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label htmlFor={`review-amount-${proposal.id}`} className="text-foreground text-sm font-medium">
                    Amount
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      removeProposal(proposal.id);
                    }}
                    disabled={loading}
                    className="text-destructive hover:text-destructive/80 text-xs transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
                <div className="relative mb-2">
                  <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
                    <Banknote className="size-4" />
                  </span>
                  <input
                    id={`review-amount-${proposal.id}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={proposal.amount}
                    onChange={(e) => {
                      updateProposal(proposal.id, { amount: e.target.value });
                    }}
                    disabled={loading}
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <label htmlFor={`review-goal-${proposal.id}`} className="text-muted-foreground mb-1 block text-xs">
                  Goal
                </label>
                <select
                  id={`review-goal-${proposal.id}`}
                  value={proposal.goalId}
                  onChange={(e) => {
                    updateProposal(proposal.id, { goalId: e.target.value });
                  }}
                  disabled={loading}
                  className={inputClass}
                >
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}

        {unrecognized.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
              <TriangleAlert className="size-4 shrink-0" />
              Unrecognized goals
            </p>
            <ul className="space-y-2 text-sm text-amber-800">
              {unrecognized.map((entry) => (
                <li key={`${entry.rawGoalName}-${entry.amount}`}>
                  {entry.rawGoalName} ({entry.amount} zł) —{" "}
                  <a href="/goals/new" className="text-primary hover:text-primary/80 underline">
                    Create this goal separately
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reviewProposals.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No proposals to save. Go back to edit your sentence or switch to manual check-in.
          </p>
        )}

        <ServerError message={saveError} />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setView("input");
              setSaveError(null);
            }}
            disabled={loading}
            className="border-border text-muted-foreground hover:bg-accent flex-1 rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSaveReview();
            }}
            disabled={loading || reviewProposals.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save check-in"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          void handleParse(e);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="ai-payment_month" className="text-foreground mb-1 block text-sm">
            Month
          </label>
          <div className="relative">
            <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
              <Calendar className="size-4" />
            </span>
            <input
              id="ai-payment_month"
              type="month"
              value={month}
              max={defaultMonth}
              onChange={(e) => {
                onMonthChange(e.target.value);
              }}
              disabled={loading}
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="ai-checkin-text" className="text-foreground mb-1 block text-sm">
            Describe what you saved this month
          </label>
          <textarea
            id="ai-checkin-text"
            value={text}
            maxLength={MAX_TEXT_LENGTH}
            rows={4}
            placeholder='e.g. "500 na wakacje, 1000 na poduszkę"'
            onChange={(e) => {
              setText(e.target.value);
              setInputError(null);
            }}
            disabled={loading}
            className={inputClass}
          />
          <p className="text-muted-foreground/70 mt-1 text-right text-xs">
            {text.length}/{MAX_TEXT_LENGTH}
          </p>
        </div>

        {inputError && (
          <p className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            {inputError}
          </p>
        )}

        {loading && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Parsing your check-in…
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Sparkles className="size-4" />
          {loading ? "Parsing..." : "Parse check-in"}
        </button>
      </form>

      <ServerError message={serverError} />

      {showFallback && (
        <button
          type="button"
          onClick={onSwitchToManual}
          className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        >
          Switch to manual check-in
        </button>
      )}
    </div>
  );
}
