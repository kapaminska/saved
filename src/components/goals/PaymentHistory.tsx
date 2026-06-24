import { useState } from "react";
import { Banknote, Calendar, Pencil, Trash2, X } from "lucide-react";
import { ServerError } from "@/components/auth/ServerError";
import { formatMonthYear } from "@/lib/i18n/format";

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

const inputClass =
  "border-input bg-background text-foreground focus:border-ring focus:ring-ring w-full rounded-lg border px-3 py-2 pl-10 text-sm focus:ring-2 focus:outline-none disabled:opacity-50";

function monthInputValue(paymentMonth: string): string {
  return paymentMonth.slice(0, 7);
}

function formatPln(amount: number): string {
  return `${amount.toFixed(2)} zł`;
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
        setError(json.error ?? "Nie udało się zaktualizować wpłaty");
        return;
      }

      if (json.completed) {
        window.location.assign(`/dashboard?celebrated=${goalId}`);
        return;
      }

      window.location.reload();
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(paymentId: string) {
    if (!window.confirm("Trwale usunąć tę wpłatę?")) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/goals/${goalId}/payments/${paymentId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const json: { success: boolean; error?: string } = await res.json();

      if (!json.success) {
        setError(json.error ?? "Nie udało się usunąć wpłaty");
        return;
      }

      window.location.reload();
    } catch {
      setError("Błąd sieci. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  if (payments.length === 0) {
    return (
      <p className="border-border bg-muted/50 text-muted-foreground rounded-lg border p-4 text-sm">
        Brak zarejestrowanych wpłat.
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
            <li key={payment.id} className="border-border bg-muted/50 rounded-lg border p-3">
              {isEditing ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor={`edit-month-${payment.id}`} className="text-muted-foreground mb-1 block text-xs">
                      Miesiąc
                    </label>
                    <div className="relative">
                      <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
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
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`edit-amount-${payment.id}`} className="text-muted-foreground mb-1 block text-xs">
                      Kwota (PLN)
                    </label>
                    <div className="relative">
                      <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
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
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={loading}
                      className="border-border text-muted-foreground hover:bg-accent inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      <X className="size-3" />
                      Anuluj
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleUpdate(payment.id);
                      }}
                      disabled={loading}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 flex-1 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      {loading ? "Zapisywanie..." : "Zapisz"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-foreground text-sm font-medium">{formatMonthYear(payment.payment_month)}</p>
                    <p className="text-muted-foreground mt-0.5 text-sm">{formatPln(payment.amount)}</p>
                  </div>
                  {editable && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(payment);
                        }}
                        disabled={loading}
                        className="text-primary hover:bg-accent hover:text-primary/80 rounded-lg p-2 transition-colors disabled:opacity-50"
                        aria-label="Edytuj wpłatę"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDelete(payment.id);
                        }}
                        disabled={loading}
                        className="text-destructive hover:bg-destructive/10 rounded-lg p-2 transition-colors disabled:opacity-50"
                        aria-label="Usuń wpłatę"
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
