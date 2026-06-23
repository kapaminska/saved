import { useState } from "react";
import { Banknote, Calendar, Pencil, Trash2, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";

interface Payment {
  id: string;
  amount: number;
  payment_month: string;
}

interface Props {
  goalId: string;
  payments: Payment[];
  editable: boolean;
}

function monthInputValue(paymentMonth: string): string {
  return paymentMonth.slice(0, 7);
}

function formatPln(amount: number): string {
  return `${amount.toFixed(2)} zł`;
}

function formatMonth(paymentMonth: string): string {
  const [year, month] = paymentMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function PaymentHistory({ goalId, payments, editable }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMonth, setEditMonth] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function startEdit(payment: Payment) {
    setEditingId(payment.id);
    setEditAmount(payment.amount.toFixed(2));
    setEditMonth(monthInputValue(payment.payment_month));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  async function handleUpdate(paymentId: string) {
    setLoading(true);
    setError(null);

    try {
      const body = new URLSearchParams();
      body.set("amount", editAmount.trim());
      body.set("payment_month", editMonth);

      const res = await fetch(`/api/goals/${goalId}/payments/${paymentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json: { success: boolean; error?: string; completed?: boolean } = await res.json();

      if (!json.success) {
        setError(json.error ?? "Failed to update payment");
        return;
      }

      if (json.completed) {
        window.location.assign(`/dashboard?celebrated=${goalId}`);
        return;
      }

      window.location.reload();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(paymentId: string) {
    if (!window.confirm("Delete this payment permanently?")) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/goals/${goalId}/payments/${paymentId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const json: { success: boolean; error?: string } = await res.json();

      if (!json.success) {
        setError(json.error ?? "Failed to delete payment");
        return;
      }

      window.location.reload();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (payments.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-blue-100/50">
        No payments recorded yet.
      </p>
    );
  }

  return (
    <div>
      <ServerError message={error} />
      <ul className="space-y-2">
        {payments.map((payment) => {
          const isEditing = editingId === payment.id;

          return (
            <li key={payment.id} className="rounded-lg border border-white/10 bg-white/5 p-3 text-white">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor={`edit-month-${payment.id}`} className="mb-1 block text-xs text-blue-100/70">
                      Month
                    </label>
                    <div className="relative">
                      <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                        <Calendar className="size-4" />
                      </span>
                      <input
                        id={`edit-month-${payment.id}`}
                        type="month"
                        value={editMonth}
                        onChange={(e) => {
                          setEditMonth(e.target.value);
                        }}
                        disabled={loading}
                        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-sm text-white focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`edit-amount-${payment.id}`} className="mb-1 block text-xs text-blue-100/70">
                      Amount (PLN)
                    </label>
                    <div className="relative">
                      <span className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                        <Banknote className="size-4" />
                      </span>
                      <input
                        id={`edit-amount-${payment.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={editAmount}
                        onChange={(e) => {
                          setEditAmount(e.target.value);
                        }}
                        disabled={loading}
                        className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-sm text-white focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={loading}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/20 px-3 py-1.5 text-xs text-blue-100/80 hover:bg-white/10 disabled:opacity-50"
                    >
                      <X className="size-3" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleUpdate(payment.id);
                      }}
                      disabled={loading}
                      className="flex-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30 disabled:opacity-50"
                    >
                      {loading ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{formatMonth(payment.payment_month)}</p>
                    <p className="mt-0.5 text-sm text-blue-100/70">{formatPln(payment.amount)}</p>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(payment);
                        }}
                        disabled={loading}
                        className="rounded-lg p-2 text-purple-300 transition-colors hover:bg-white/10 hover:text-purple-100 disabled:opacity-50"
                        aria-label="Edit payment"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDelete(payment.id);
                        }}
                        disabled={loading}
                        className="rounded-lg p-2 text-red-300 transition-colors hover:bg-white/10 hover:text-red-100 disabled:opacity-50"
                        aria-label="Delete payment"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
