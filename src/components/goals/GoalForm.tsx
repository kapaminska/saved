import { useState } from "react";
import { Target, Banknote, Calendar, ArrowRight, TriangleAlert, PiggyBank } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { deadlineToMonthInput } from "@/lib/goals/validation";

interface GoalInitial {
  name: string;
  target_amount: number;
  saved_amount: number;
  deadline: string | null;
}

interface Props {
  mode: "create" | "edit";
  initial: GoalInitial | null;
  goalId?: string;
  hasPayments?: boolean;
  successRedirect?: string;
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

export default function GoalForm({
  mode,
  initial,
  goalId,
  hasPayments = false,
  successRedirect = "/dashboard",
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(
    initial?.target_amount != null ? formatAmount(initial.target_amount) : "",
  );
  const [savedAmount, setSavedAmount] = useState(
    initial?.saved_amount != null ? formatAmount(initial.saved_amount) : "0",
  );
  const [deadline, setDeadline] = useState(deadlineToMonthInput(initial?.deadline ?? null));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [amountError, setAmountError] = useState<string | undefined>();
  const [savedAmountError, setSavedAmountError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const initialTarget = initial?.target_amount != null ? formatAmount(initial.target_amount) : "";
  const initialDeadline = deadlineToMonthInput(initial?.deadline ?? null);
  const showWarning =
    mode === "edit" && initial != null && (targetAmount !== initialTarget || deadline !== initialDeadline);

  function validate(): boolean {
    let valid = true;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Goal name is required");
      valid = false;
    } else if (trimmedName.length > 100) {
      setNameError("Goal name must be at most 100 characters");
      valid = false;
    } else {
      setNameError(undefined);
    }

    const rawAmount = targetAmount.trim();
    if (!rawAmount) {
      setAmountError("Target amount is required");
      valid = false;
    } else if (!/^\d+(\.\d{1,2})?$/.test(rawAmount)) {
      setAmountError("Enter a positive amount with at most 2 decimal places");
      valid = false;
    } else if (parseFloat(rawAmount) <= 0) {
      setAmountError("Target amount must be greater than 0");
      valid = false;
    } else {
      setAmountError(undefined);
    }

    if (!hasPayments) {
      const rawSaved = savedAmount.trim();
      if (!rawSaved) {
        setSavedAmountError("Saved amount is required");
        valid = false;
      } else if (!/^\d+(\.\d{1,2})?$/.test(rawSaved)) {
        setSavedAmountError("Enter an amount with at most 2 decimal places");
        valid = false;
      } else if (parseFloat(rawSaved) < 0) {
        setSavedAmountError("Saved amount must be 0 or greater");
        valid = false;
      } else {
        setSavedAmountError(undefined);
      }
    }

    return valid;
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const body = new URLSearchParams();
      body.set("name", name.trim());
      body.set("target_amount", targetAmount.trim());
      body.set("deadline", deadline.trim());
      if (!hasPayments) {
        body.set("saved_amount", savedAmount.trim());
      }

      const url = mode === "create" ? "/api/goals" : `/api/goals/${goalId}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json: {
        success: boolean;
        error?: string;
        goal?: { id: string };
        completed?: boolean;
      } = await res.json();

      if (!json.success) {
        setError(json.error ?? "Failed to save goal");
        return;
      }

      const id = json.goal?.id ?? goalId;
      if (mode === "create" && id) {
        window.location.assign(successRedirect);
        return;
      }

      if (json.completed && id) {
        window.location.assign(`/dashboard?celebrated=${id}`);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="name"
        type="text"
        label="Goal name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (nameError) setNameError(undefined);
        }}
        placeholder="e.g. Emergency fund"
        error={nameError}
        icon={<Target className="size-4" />}
        inputProps={{ maxLength: 100 }}
      />

      <FormField
        id="target_amount"
        type="number"
        label="Target amount (PLN)"
        value={targetAmount}
        onChange={(v) => {
          setTargetAmount(v);
          if (amountError) setAmountError(undefined);
        }}
        placeholder="e.g. 5000.00"
        error={amountError}
        icon={<Banknote className="size-4" />}
        inputProps={{ step: "0.01", min: "0.01" }}
      />

      {hasPayments ? (
        <div>
          <p className="mb-1 block text-sm text-blue-100/80">Already saved (PLN)</p>
          <p className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-blue-100/70">
            {formatAmount(initial?.saved_amount ?? 0)} — tracked via payment history
          </p>
        </div>
      ) : (
        <FormField
          id="saved_amount"
          type="number"
          label="Already saved (PLN)"
          value={savedAmount}
          onChange={(v) => {
            setSavedAmount(v);
            if (savedAmountError) setSavedAmountError(undefined);
          }}
          placeholder="e.g. 500.00"
          error={savedAmountError}
          icon={<PiggyBank className="size-4" />}
          inputProps={{ step: "0.01", min: "0" }}
        />
      )}

      <FormField
        id="deadline"
        type="month"
        label="Deadline (optional)"
        value={deadline}
        onChange={setDeadline}
        icon={<Calendar className="size-4" />}
      />

      {showWarning && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Changing the target or deadline may affect your progress tracking.
        </p>
      )}

      <ServerError message={error} />

      {success && (
        <p className="rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-center text-sm text-green-300">
          Saved!
        </p>
      )}

      <SubmitButton pendingText="Saving..." icon={<ArrowRight className="size-4" />} disabled={loading}>
        {mode === "create" ? "Create goal" : "Save changes"}
      </SubmitButton>
    </form>
  );
}
