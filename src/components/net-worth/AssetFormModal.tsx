import { useState } from "react";
import { ArrowRight, Banknote, Plus, Tag, Target, Trash2, X } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { ASSET_CATEGORIES, type AssetCategory } from "@/lib/net-worth/validation";

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: "Cash",
  savings: "Savings",
  investments: "Investments",
  real_estate: "Real estate",
  other: "Other",
};

interface AssetInitial {
  id: string;
  name: string;
  amount: number;
  category: string;
}

interface AssetDraft {
  key: string;
  name: string;
  amount: string;
  category: string;
}

interface RowErrors {
  name?: string;
  amount?: string;
  category?: string;
}

interface Props {
  mode: "create" | "edit";
  initial?: AssetInitial;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

function createEmptyRow(): AssetDraft {
  return { key: crypto.randomUUID(), name: "", amount: "", category: "cash" };
}

function createEditRow(initial: AssetInitial): AssetDraft {
  return {
    key: "edit",
    name: initial.name,
    amount: formatAmount(initial.amount),
    category: initial.category,
  };
}

function validateRow(row: AssetDraft): { ok: true } | { ok: false; errors: RowErrors } {
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

  if (!ASSET_CATEGORIES.includes(row.category as AssetCategory)) {
    errors.category = "Select a category";
  }

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}

export default function AssetFormModal({ mode, initial, open, onOpenChange, onSuccess }: Props) {
  const [rows, setRows] = useState<AssetDraft[]>(() =>
    mode === "edit" && initial ? [createEditRow(initial)] : [createEmptyRow()],
  );
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleClose() {
    if (loading) return;
    onOpenChange(false);
  }

  function updateRow(key: string, patch: Partial<Omit<AssetDraft, "key">>) {
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
        body.set("category", row.category);

        const res = await fetch(`/api/assets/${initial?.id ?? ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
        const json: { success: boolean; error?: string } = await res.json();

        if (!json.success) {
          setError(json.error ?? "Failed to save asset");
          return;
        }
      } else {
        for (const row of rows) {
          const body = new URLSearchParams();
          body.set("name", row.name.trim());
          body.set("amount", row.amount.trim());
          body.set("category", row.category);

          const res = await fetch("/api/assets", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          const json: { success: boolean; error?: string } = await res.json();

          if (!json.success) {
            const label = row.name.trim() || "asset";
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
    <div className="bg-foreground/20 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-form-title"
        className="border-border bg-card text-foreground flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl border shadow-xl"
      >
        <div className="border-border flex items-start justify-between gap-4 border-b p-6 pb-4">
          <h2 id="asset-form-title" className="text-foreground text-lg font-bold">
            {mode === "create" ? (isMultiCreate ? "Add assets" : "Add asset") : "Edit asset"}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-1 transition-colors disabled:opacity-50"
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
                  className={showRowHeader ? "border-border bg-muted/50 rounded-xl border p-4" : undefined}
                >
                  {showRowHeader && (
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-foreground text-sm font-medium">Asset {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => {
                          removeRow(row.key);
                        }}
                        disabled={loading}
                        className="text-destructive hover:bg-destructive/10 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                        aria-label={`Remove asset ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}

                  <div className="space-y-4">
                    <FormField
                      id={`asset-name-${row.key}`}
                      type="text"
                      label="Name"
                      value={row.name}
                      onChange={(v) => {
                        updateRow(row.key, { name: v });
                      }}
                      placeholder="e.g. Savings account"
                      error={errors.name}
                      icon={<Target className="size-4" />}
                      inputProps={{ maxLength: 100, disabled: loading }}
                    />

                    <FormField
                      id={`asset-amount-${row.key}`}
                      type="number"
                      label="Amount (PLN)"
                      value={row.amount}
                      onChange={(v) => {
                        updateRow(row.key, { amount: v });
                      }}
                      placeholder="e.g. 10000.00"
                      error={errors.amount}
                      icon={<Banknote className="size-4" />}
                      inputProps={{ step: "0.01", min: "0", disabled: loading }}
                    />

                    <div>
                      <label htmlFor={`asset-category-${row.key}`} className="text-foreground mb-1 block text-sm">
                        Category
                      </label>
                      <div className="relative">
                        <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">
                          <Tag className="size-4" />
                        </span>
                        <select
                          id={`asset-category-${row.key}`}
                          value={row.category}
                          disabled={loading}
                          onChange={(e) => {
                            updateRow(row.key, { category: e.target.value });
                          }}
                          className="border-input bg-background text-foreground focus:border-ring focus:ring-ring w-full appearance-none rounded-lg border px-3 py-2 pl-10 focus:ring-2 focus:outline-none disabled:opacity-50"
                        >
                          {ASSET_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {CATEGORY_LABELS[cat]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {errors.category && <p className="text-destructive mt-1 text-xs">{errors.category}</p>}
                    </div>
                  </div>
                </div>
              );
            })}

            {mode === "create" && (
              <button
                type="button"
                onClick={addRow}
                disabled={loading}
                className="border-border text-muted-foreground hover:border-primary/40 hover:bg-accent hover:text-foreground flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
              >
                <Plus className="size-4" />
                Add another asset
              </button>
            )}

            <ServerError message={error} />
          </div>

          <div className="border-border border-t p-6 pt-4">
            <SubmitButton pendingText="Saving..." icon={<ArrowRight className="size-4" />} disabled={loading}>
              {mode === "create" ? (rows.length > 1 ? `Add ${rows.length} assets` : "Add asset") : "Save changes"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export { CATEGORY_LABELS };
