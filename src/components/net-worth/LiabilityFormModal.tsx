import { useState } from "react";
import { ArrowRight, Banknote, Plus, Target, Trash2, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface LiabilityInitial {
  id: string;
  name: string;
  amount: number;
}

interface LiabilityDraft {
  key: string;
  name: string;
  amount: string;
}

interface RowErrors {
  name?: string;
  amount?: string;
}

interface Props {
  mode: "create" | "edit";
  initial?: LiabilityInitial;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

function createEmptyRow(): LiabilityDraft {
  return { key: crypto.randomUUID(), name: "", amount: "" };
}

function createEditRow(initial: LiabilityInitial): LiabilityDraft {
  return {
    key: "edit",
    name: initial.name,
    amount: formatAmount(initial.amount),
  };
}

function validateRow(row: LiabilityDraft): { ok: true } | { ok: false; errors: RowErrors } {
  const errors: RowErrors = {};
  const trimmedName = row.name.trim();

  if (!trimmedName) {
    errors.name = "Name is required";
  } else if (trimmedName.length > 100) {
    errors.name = "Name must be at most 100 characters";
  }

  const rawAmount = row.amount.trim();
  if (!rawAmount) {
    errors.amount = "Amount is required";
  } else if (!/^\d+(\.\d{1,2})?$/.test(rawAmount)) {
    errors.amount = "Enter an amount with at most 2 decimal places";
  } else if (parseFloat(rawAmount) < 0) {
    errors.amount = "Amount must be 0 or greater";
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}

export default function LiabilityFormModal({ mode, initial, open, onOpenChange, onSuccess }: Props) {
  const [rows, setRows] = useState<LiabilityDraft[]>(() =>
    mode === "edit" && initial ? [createEditRow(initial)] : [createEmptyRow()],
  );
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleClose() {
    if (loading) return;
    onOpenChange(false);
  }

  function updateRow(key: string, patch: Partial<Omit<LiabilityDraft, "key">>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setRowErrors(({ [key]: _, ...rest }) => rest);
  }

  function addRow() {
    setRows((current) => [...current, createEmptyRow()]);
  }

  function removeRow(key: string) {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)));
    setRowErrors(({ [key]: _, ...rest }) => rest);
  }

  function validateAll(): boolean {
    const nextErrors: Record<string, RowErrors> = {};
    let valid = true;

    for (const row of rows) {
      const result = validateRow(row);
      if (!result.ok) {
        nextErrors[row.key] = result.errors;
        valid = false;
      }
    }

    setRowErrors(nextErrors);
    return valid;
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateAll()) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === "edit") {
        const row = rows[0];
        const body = new URLSearchParams();
        body.set("name", row.name.trim());
        body.set("amount", row.amount.trim());

        const res = await fetch(`/api/liabilities/${initial?.id ?? ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const json: { success: boolean; error?: string } = await res.json();

        if (!json.success) {
          setError(json.error ?? "Failed to save liability");
          return;
        }
      } else {
        for (const row of rows) {
          const body = new URLSearchParams();
          body.set("name", row.name.trim());
          body.set("amount", row.amount.trim());

          const res = await fetch("/api/liabilities", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          const json: { success: boolean; error?: string } = await res.json();

          if (!json.success) {
            const label = row.name.trim() || "liability";
            setError(json.error ? `Failed to save "${label}": ${json.error}` : `Failed to save "${label}"`);
            return;
          }
        }
      }

      onOpenChange(false);
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const isMultiCreate = mode === "create" && rows.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="liability-form-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border border-white/20 bg-gradient-to-br from-purple-900/95 to-blue-900/95 text-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6 pb-4">
          <h2 id="liability-form-title" className="text-lg font-bold text-white">
            {mode === "create" ? (isMultiCreate ? "Add liabilities" : "Add liability") : "Edit liability"}
          </h2>
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="space-y-4 overflow-y-auto p-6 pt-4">
            {rows.map((row, index) => {
              const errors = rowErrors[row.key] ?? {};
              const showRowHeader = mode === "create" && rows.length > 1;

              return (
                <div
                  key={row.key}
                  className={showRowHeader ? "rounded-xl border border-white/10 bg-white/5 p-4" : undefined}
                >
                  {showRowHeader && (
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-blue-100/80">Liability {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          removeRow(row.key);
                        }}
                        disabled={loading}
                        className="rounded-lg p-1.5 text-red-300/80 transition-colors hover:bg-white/10 hover:text-red-200 disabled:opacity-50"
                        aria-label={`Remove liability ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}

                  <div className="space-y-4">
                    <FormField
                      id={`liability-name-${row.key}`}
                      type="text"
                      label="Name"
                      value={row.name}
                      onChange={(v) => {
                        updateRow(row.key, { name: v });
                      }}
                      placeholder="e.g. Mortgage"
                      error={errors.name}
                      icon={<Target className="size-4" />}
                      inputProps={{ maxLength: 100, disabled: loading }}
                    />

                    <FormField
                      id={`liability-amount-${row.key}`}
                      type="number"
                      label="Amount (PLN)"
                      value={row.amount}
                      onChange={(v) => {
                        updateRow(row.key, { amount: v });
                      }}
                      placeholder="e.g. 80000.00"
                      error={errors.amount}
                      icon={<Banknote className="size-4" />}
                      inputProps={{ step: "0.01", min: "0", disabled: loading }}
                    />
                  </div>
                </div>
              );
            })}

            {mode === "create" && (
              <button
                type="button"
                onClick={addRow}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-2.5 text-sm text-blue-100/80 transition-colors hover:border-purple-400/40 hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <Plus className="size-4" />
                Add another liability
              </button>
            )}

            <ServerError message={error} />
          </div>

          <div className="border-t border-white/10 p-6 pt-4">
            <SubmitButton pendingText="Saving..." icon={<ArrowRight className="size-4" />} disabled={loading}>
              {mode === "create"
                ? rows.length > 1
                  ? `Add ${rows.length} liabilities`
                  : "Add liability"
                : "Save changes"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
