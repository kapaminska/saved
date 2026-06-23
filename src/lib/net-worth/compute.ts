import type { Database } from "@/types/database";

type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

export function computeNetWorth(assets: { amount: number }[], liabilities: { amount: number }[]): number {
  const assetTotal = assets.reduce((sum, asset) => sum + asset.amount, 0);
  const liabilityTotal = liabilities.reduce((sum, liability) => sum + liability.amount, 0);
  return assetTotal - liabilityTotal;
}

export function getStalestAsset(assets: AssetRow[]): AssetRow | null {
  if (assets.length === 0) {
    return null;
  }

  return assets.reduce((oldest, asset) =>
    new Date(asset.last_updated_at) < new Date(oldest.last_updated_at) ? asset : oldest,
  );
}

/** True when lastUpdatedAt is older than three calendar months before `now`. */
export function isAssetStale(lastUpdatedAt: string, now = new Date()): boolean {
  const updated = new Date(lastUpdatedAt);
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - 3);
  return updated < threshold;
}

export function getNetWorthHeadline(relationshipStatus: string | null): string {
  if (relationshipStatus === "married" || relationshipStatus === "partnership") {
    return "Wasza wartość netto";
  }
  return "Twoja wartość netto";
}
