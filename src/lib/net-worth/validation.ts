import type { Database } from "@/types/database";

type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
type LiabilityRow = Database["public"]["Tables"]["liabilities"]["Row"];

export const ASSET_CATEGORIES = ["cash", "savings", "investments", "real_estate", "other"] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export function parseName(value: string | null): { ok: true; name: string } | { ok: false; error: string } {
  const name = (value ?? "").trim();
  if (name.length < 1) {
    return { ok: false, error: "Name is required" };
  }
  if (name.length > 100) {
    return { ok: false, error: "Name must be at most 100 characters" };
  }
  return { ok: true, name };
}

export function parseAmount(value: string | null): { ok: true; amount: number } | { ok: false; error: string } {
  const raw = (value ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Amount is required" };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: "Amount must be a number with at most 2 decimal places" };
  }
  const amount = parseFloat(raw);
  if (isNaN(amount) || amount < 0) {
    return { ok: false, error: "Amount must be 0 or greater" };
  }
  return { ok: true, amount };
}

export function parseAssetCategory(
  value: string | null,
): { ok: true; category: AssetCategory } | { ok: false; error: string } {
  const category = (value ?? "").trim();
  if (!ASSET_CATEGORIES.includes(category as AssetCategory)) {
    return { ok: false, error: "Invalid asset category" };
  }
  return { ok: true, category: category as AssetCategory };
}

export function formatAssetRow(row: AssetRow) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    category: row.category,
    last_updated_at: row.last_updated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatLiabilityRow(row: LiabilityRow) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
