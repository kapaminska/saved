import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import AssetFormModal, { CATEGORY_LABELS } from "@/components/net-worth/AssetFormModal";
import LiabilityFormModal from "@/components/net-worth/LiabilityFormModal";
import StaleAssetBanner from "@/components/net-worth/StaleAssetBanner";
import type { AssetCategory } from "@/lib/net-worth/validation";

interface AssetItem {
  id: string;
  name: string;
  amount: number;
  category: string;
  lastUpdatedAt: string;
}

interface LiabilityItem {
  id: string;
  name: string;
  amount: number;
}

interface StaleAsset {
  id: string;
  name: string;
  lastUpdatedAt: string;
}

interface Props {
  headline: string;
  netWorth: number;
  assets: AssetItem[];
  liabilities: LiabilityItem[];
  stalestAsset: StaleAsset | null;
  hasAnyItems: boolean;
}

function formatPln(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  return amount < 0 ? `-${abs} zł` : `${abs} zł`;
}

function categoryLabel(category: string): string {
  if (category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as AssetCategory];
  }
  return category;
}

export default function NetWorthPanel({ headline, netWorth, assets, liabilities, stalestAsset, hasAnyItems }: Props) {
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [assetModalMode, setAssetModalMode] = useState<"create" | "edit">("create");
  const [assetFormSession, setAssetFormSession] = useState(0);
  const [editingAsset, setEditingAsset] = useState<AssetItem | undefined>();
  const [liabilityModalOpen, setLiabilityModalOpen] = useState(false);
  const [liabilityModalMode, setLiabilityModalMode] = useState<"create" | "edit">("create");
  const [liabilityFormSession, setLiabilityFormSession] = useState(0);
  const [editingLiability, setEditingLiability] = useState<LiabilityItem | undefined>();
  const [actionLoading, setActionLoading] = useState(false);

  function reloadDashboard() {
    window.location.reload();
  }

  function openCreateAsset() {
    setAssetFormSession((s) => s + 1);
    setAssetModalMode("create");
    setEditingAsset(undefined);
    setAssetModalOpen(true);
  }

  function openEditAsset(asset: AssetItem) {
    setAssetFormSession((s) => s + 1);
    setAssetModalMode("edit");
    setEditingAsset(asset);
    setAssetModalOpen(true);
  }

  function openCreateLiability() {
    setLiabilityFormSession((s) => s + 1);
    setLiabilityModalMode("create");
    setEditingLiability(undefined);
    setLiabilityModalOpen(true);
  }

  function openEditLiability(liability: LiabilityItem) {
    setLiabilityFormSession((s) => s + 1);
    setLiabilityModalMode("edit");
    setEditingLiability(liability);
    setLiabilityModalOpen(true);
  }

  async function handleConfirmAsset(id: string) {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/assets/${id}/confirm`, { method: "POST" });
      const json: { success: boolean } = await res.json();
      if (json.success) {
        reloadDashboard();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteAsset(id: string, name: string) {
    if (actionLoading) return;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/assets/${id}/delete`, { method: "POST" });
      const json: { success: boolean } = await res.json();
      if (json.success) {
        reloadDashboard();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteLiability(id: string, name: string) {
    if (actionLoading) return;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/liabilities/${id}/delete`, { method: "POST" });
      const json: { success: boolean } = await res.json();
      if (json.success) {
        reloadDashboard();
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (!hasAnyItems) {
    return (
      <>
        <div className="mb-8 rounded-xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
          <h2 className="mb-1 text-lg font-semibold text-white">{headline}</h2>
          <p className="mb-4 text-2xl font-bold text-white">—</p>
          <button
            type="button"
            onClick={openCreateAsset}
            className="rounded-lg border border-purple-400/40 bg-purple-900/30 px-4 py-2 text-sm text-purple-200 transition-colors hover:bg-purple-900/50"
          >
            Add your first asset
          </button>
        </div>

        <AssetFormModal
          key={`asset-${assetFormSession}`}
          mode="create"
          open={assetModalOpen}
          onOpenChange={setAssetModalOpen}
          onSuccess={reloadDashboard}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-8 rounded-xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-xl">
        <h2 className="mb-1 text-lg font-semibold text-white">{headline}</h2>
        <p className="mb-4 text-2xl font-bold text-white">{formatPln(netWorth)}</p>

        {stalestAsset && (
          <StaleAssetBanner
            stalestAsset={stalestAsset}
            onConfirm={() => {
              void handleConfirmAsset(stalestAsset.id);
            }}
            onDismiss={() => {
              /* localStorage handled in banner */
            }}
          />
        )}

        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-blue-100/90">Assets</h3>
            <button
              type="button"
              onClick={openCreateAsset}
              disabled={actionLoading}
              className="rounded-lg border border-purple-400/40 bg-purple-900/30 px-3 py-1 text-sm text-purple-200 transition-colors hover:bg-purple-900/50 disabled:opacity-50"
            >
              Add asset
            </button>
          </div>
          {assets.length > 0 ? (
            <ul className="space-y-2">
              {assets.map((asset) => (
                <li
                  key={asset.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-white">{asset.name}</span>
                      <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-xs text-blue-100/70">
                        {categoryLabel(asset.category)}
                      </span>
                    </div>
                    <p className="text-sm text-blue-100/70">{formatPln(asset.amount)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleConfirmAsset(asset.id);
                      }}
                      disabled={actionLoading}
                      className="text-xs text-blue-100/70 transition-colors hover:text-white disabled:opacity-50"
                    >
                      Still current
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openEditAsset(asset);
                      }}
                      disabled={actionLoading}
                      className="rounded-lg p-1.5 text-purple-300 transition-colors hover:bg-white/10 hover:text-purple-100 disabled:opacity-50"
                      aria-label={`Edit ${asset.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteAsset(asset.id, asset.name);
                      }}
                      disabled={actionLoading}
                      className="rounded-lg p-1.5 text-red-300/80 transition-colors hover:bg-white/10 hover:text-red-200 disabled:opacity-50"
                      aria-label={`Delete ${asset.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-blue-100/50">No assets yet.</p>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-blue-100/90">Liabilities</h3>
            <button
              type="button"
              onClick={openCreateLiability}
              disabled={actionLoading}
              className="rounded-lg border border-purple-400/40 bg-purple-900/30 px-3 py-1 text-sm text-purple-200 transition-colors hover:bg-purple-900/50 disabled:opacity-50"
            >
              Add liability
            </button>
          </div>
          {liabilities.length > 0 ? (
            <ul className="space-y-2">
              {liabilities.map((liability) => (
                <li
                  key={liability.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-white">{liability.name}</span>
                    <p className="text-sm text-blue-100/70">{formatPln(liability.amount)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openEditLiability(liability);
                      }}
                      disabled={actionLoading}
                      className="rounded-lg p-1.5 text-purple-300 transition-colors hover:bg-white/10 hover:text-purple-100 disabled:opacity-50"
                      aria-label={`Edit ${liability.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteLiability(liability.id, liability.name);
                      }}
                      disabled={actionLoading}
                      className="rounded-lg p-1.5 text-red-300/80 transition-colors hover:bg-white/10 hover:text-red-200 disabled:opacity-50"
                      aria-label={`Delete ${liability.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-blue-100/50">No liabilities yet.</p>
          )}
        </div>
      </div>

      <AssetFormModal
        key={`asset-${assetFormSession}`}
        mode={assetModalMode}
        initial={editingAsset}
        open={assetModalOpen}
        onOpenChange={setAssetModalOpen}
        onSuccess={reloadDashboard}
      />
      <LiabilityFormModal
        key={`liability-${liabilityFormSession}`}
        mode={liabilityModalMode}
        initial={editingLiability}
        open={liabilityModalOpen}
        onOpenChange={setLiabilityModalOpen}
        onSuccess={reloadDashboard}
      />
    </>
  );
}
