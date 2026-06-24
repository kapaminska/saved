import { useState } from "react";
import { Target, Banknote, Calendar, ArrowRight, TriangleAlert, PiggyBank } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { formatAmountInput, formatPln } from "@/lib/i18n/format";
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

export default function GoalForm({
  mode,
  initial,
  goalId,
  hasPayments = false,
  successRedirect = "/dashboard",
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(
    initial?.target_amount != null ? formatAmountInput(initial.target_amount) : "",
  );
  const [savedAmount, setSavedAmount] = useState(
    initial?.saved_amount != null ? formatAmountInput(initial.saved_amount) : "0",
  );
  const [deadline, setDeadline] = useState(deadlineToMonthInput(initial?.deadline ?? null));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [amountError, setAmountError] = useState<string | undefined>();
  const [savedAmountError, setSavedAmountError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const initialTarget = initial?.target_amount != null ? formatAmountInput(initial.target_amount) : "";
  const initialDeadline = deadlineToMonthInput(initial?.deadline ?? null);
  const showWarning =
    mode === "edit" && initial != null && (targetAmount !== initialTarget || deadline !== initialDeadline);

  function validate(): boolean {
    let valid = true;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Nazwa celu jest wymagana");
      valid = false;
    } else if (trimmedName.length > 100) {
      setNameError("Nazwa celu może mieć maksymalnie 100 znaków");
      valid = false;
    } else {
      setNameError(undefined);
    }

    const rawAmount = targetAmount.trim();
    if (!rawAmount) {
      setAmountError("Kwota docelowa jest wymagana");
      valid = false;
    } else if (!/^\d+(\.\d{1,2})?$/.test(rawAmount)) {
      setAmountError("Podaj dodatnią kwotę z maksymalnie 2 miejscami po przecinku");
      valid = false;
    } else if (parseFloat(rawAmount) <= 0) {
      setAmountError("Kwota docelowa musi być większa od 0");
      valid = false;
    } else {
      setAmountError(undefined);
    }

    if (!hasPayments) {
      const rawSaved = savedAmount.trim();
      if (!rawSaved) {
        setSavedAmountError("Odłożona kwota jest wymagana");
        valid = false;
      } else if (!/^\d+(\.\d{1,2})?$/.test(rawSaved)) {
        setSavedAmountError("Podaj kwotę z maksymalnie 2 miejscami po przecinku");
        valid = false;
      } else if (parseFloat(rawSaved) < 0) {
        setSavedAmountError("Odłożona kwota musi być 0 lub większa");
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
        setError(json.error ?? "Nie udało się zapisać celu");
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
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField
        id="name"
        type="text"
        label="Nazwa celu"
        value={name}
        onChange={(v) => {
          setName(v);
          if (nameError) setNameError(undefined);
        }}
        placeholder="np. Poduszka finansowa"
        error={nameError}
        icon={<Target className="size-4" />}
        inputProps={{ maxLength: 100 }}
      />

      <FormField
        id="target_amount"
        type="number"
        label="Kwota docelowa (PLN)"
        value={targetAmount}
        onChange={(v) => {
          setTargetAmount(v);
          if (amountError) setAmountError(undefined);
        }}
        placeholder="np. 5000.00"
        error={amountError}
        icon={<Banknote className="size-4" />}
        inputProps={{ step: "0.01", min: "0.01" }}
      />

      {hasPayments ? (
        <div>
          <p className="text-foreground mb-1 block text-sm">Już odłożono (PLN)</p>
          <p className="border-border bg-muted/50 text-muted-foreground rounded-lg border px-3 py-2 text-sm">
            {formatPln(initial?.saved_amount ?? 0)} — śledzone przez historię wpłat
          </p>
        </div>
      ) : (
        <FormField
          id="saved_amount"
          type="number"
          label="Już odłożono (PLN)"
          value={savedAmount}
          onChange={(v) => {
            setSavedAmount(v);
            if (savedAmountError) setSavedAmountError(undefined);
          }}
          placeholder="np. 500.00"
          error={savedAmountError}
          icon={<PiggyBank className="size-4" />}
          inputProps={{ step: "0.01", min: "0" }}
        />
      )}

      <FormField
        id="deadline"
        type="month"
        label="Termin (opcjonalnie)"
        value={deadline}
        onChange={setDeadline}
        icon={<Calendar className="size-4" />}
      />

      {showWarning && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Zmiana kwoty docelowej lub terminu może wpłynąć na śledzenie postępu.
        </p>
      )}

      <ServerError message={error} />

      {success && (
        <p className="rounded-lg border border-green-200 bg-green-100 px-3 py-2 text-center text-sm text-green-800">
          Zapisano!
        </p>
      )}

      <SubmitButton pendingText="Zapisywanie..." icon={<ArrowRight className="size-4" />} disabled={loading}>
        {mode === "create" ? "Utwórz cel" : "Zapisz zmiany"}
      </SubmitButton>
    </form>
  );
}
