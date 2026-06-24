import { useState } from "react";
import { ClipboardCheck, X } from "lucide-react";
import AiCheckInTab from "@/components/goals/AiCheckInTab";
import ManualCheckInForm from "@/components/goals/ManualCheckInForm";

interface CheckInGoal {
  id: string;
  name: string;
}

interface Props {
  goals: CheckInGoal[];
  defaultMonth: string;
}

type ActiveTab = "ai" | "manual";

const tabActive = "bg-primary text-primary-foreground font-medium";
const tabInactive = "text-muted-foreground hover:bg-accent hover:text-accent-foreground";

export default function CheckInModal({ goals, defaultMonth }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("ai");
  const [month, setMonth] = useState(defaultMonth);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpen() {
    setMonth(defaultMonth);
    setActiveTab("ai");
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
  }

  function handleSwitchToManual() {
    setActiveTab("manual");
    setError(null);
  }

  async function handleManualSubmit(data: { month: string; amounts: Record<string, string> }) {
    setLoading(true);
    setError(null);

    const body = new URLSearchParams();
    body.set("payment_month", data.month);

    let hasPayment = false;
    for (const goal of goals) {
      const raw = (data.amounts[goal.id] ?? "").trim();
      if (!raw) continue;
      body.append("goal_id", goal.id);
      body.append("amount", raw);
      hasPayment = true;
    }

    if (!hasPayment) {
      setError("Podaj kwotę dla co najmniej jednego celu lub wpisz 0, aby odnotować brak oszczędności.");
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
        setError(json.error ?? "Nie udało się zapisać check-inu");
        return;
      }

      const completed = json.completedGoals?.[0];
      if (completed) {
        window.location.href = `/dashboard?celebrated=${completed.id}`;
        return;
      }

      window.location.reload();
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  if (goals.length === 0) return null;

  const subtitle =
    activeTab === "ai"
      ? "Opisz swoje oszczędności prostym językiem. Zaproponujemy kwoty do sprawdzenia przed zapisaniem."
      : "Zapisz, ile odłożyłeś/aś w tym miesiącu. Zostaw pole puste, aby pominąć cel.";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors"
      >
        <ClipboardCheck className="size-4" />
        Zrób check-in
      </button>

      {open && (
        <div className="bg-foreground/20 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkin-title"
            className="border-border bg-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="checkin-title" className="text-foreground text-xl font-bold">
                  Miesięczny check-in
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
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

            <div className="border-border bg-muted mb-4 flex gap-1 rounded-lg border p-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("ai");
                  setError(null);
                }}
                disabled={loading}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  activeTab === "ai" ? tabActive : tabInactive
                }`}
              >
                Check-in AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("manual");
                  setError(null);
                }}
                disabled={loading}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  activeTab === "manual" ? tabActive : tabInactive
                }`}
              >
                Ręcznie
              </button>
            </div>

            {activeTab === "ai" ? (
              <AiCheckInTab
                goals={goals}
                month={month}
                defaultMonth={defaultMonth}
                onMonthChange={setMonth}
                onSwitchToManual={handleSwitchToManual}
              />
            ) : (
              <ManualCheckInForm
                goals={goals}
                month={month}
                defaultMonth={defaultMonth}
                onMonthChange={setMonth}
                loading={loading}
                error={error}
                onSubmit={(data) => {
                  void handleManualSubmit(data);
                }}
              />
            )}

            {activeTab === "manual" && (
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="border-border text-muted-foreground hover:bg-accent flex-1 rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-50"
                >
                  Anuluj
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
