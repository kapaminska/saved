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
      const json: {
        success: boolean;
        error?: string;
        completedGoals?: { id: string; name: string }[];
      } = await res.json();

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

  const subtitle =
    activeTab === "ai"
      ? "Describe what you saved in plain language. We'll suggest amounts to review before saving."
      : "Record what you saved this month. Leave a field empty to skip a goal.";

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
                <p className="mt-1 text-sm text-blue-100/70">{subtitle}</p>
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

            <div className="mb-4 flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("ai");
                  setError(null);
                }}
                disabled={loading}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  activeTab === "ai"
                    ? "bg-white/20 font-medium text-white"
                    : "text-blue-100/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                AI check-in
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("manual");
                  setError(null);
                }}
                disabled={loading}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  activeTab === "manual"
                    ? "bg-white/20 font-medium text-white"
                    : "text-blue-100/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                Manual
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
                  className="flex-1 rounded-lg border border-white/20 px-4 py-2 text-sm text-blue-100/80 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
