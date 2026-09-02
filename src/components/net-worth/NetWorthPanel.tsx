import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import AssetFormModal, { CATEGORY_LABELS } from "@/components/net-worth/AssetFormModal";
import LiabilityFormModal from "@/components/net-worth/LiabilityFormModal";
import StaleAssetBanner from "@/components/net-worth/StaleAssetBanner";
import { formatPln } from "@/lib/i18n/format";
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
    if (!window.confirm(`Usunąć „${name}"? Tej operacji nie można cofnąć.`)) return;

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
    if (!window.confirm(`Usunąć „${name}"? Tej operacji nie można cofnąć.`)) return;

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
        <div className="border-border bg-card mb-8 rounded-xl border p-6 shadow-sm">
          <h2 className="text-foreground mb-1 text-lg font-semibold">{headline}</h2>
          <p className="text-foreground mb-4 text-2xl font-bold">—</p>
          <button
            type="button"
            onClick={openCreateAsset}
            className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            Dodaj pierwszy aktyw
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
      <div className="border-border bg-card mb-8 rounded-xl border p-6 shadow-sm">
        <h2 className="text-foreground mb-1 text-lg font-semibold">{headline}</h2>
        <p className="text-foreground mb-4 text-2xl font-bold">{formatPln(netWorth)}</p>

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
            <h3 className="text-foreground text-sm font-semibold">Aktywa</h3>
            <button
              type="button"
              onClick={openCreateAsset}
              disabled={actionLoading}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg border px-3 py-1 text-sm transition-colors disabled:opacity-50"
            >
              Dodaj aktyw
            </button>
          </div>
          {assets.length > 0 ? (
            <ul className="space-y-2">
              {assets.map((asset) => (
                <li
                  key={asset.id}
                  className="border-border bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground font-medium">{asset.name}</span>
                      <span className="border-border bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                        {categoryLabel(asset.category)}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm">{formatPln(asset.amount)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openEditAsset(asset);
                      }}
                      disabled={actionLoading}
                      className="text-primary hover:bg-accent hover:text-primary/80 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                      aria-label={`Edytuj ${asset.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteAsset(asset.id, asset.name);
                      }}
                      disabled={actionLoading}
                      className="text-destructive hover:bg-destructive/10 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                      aria-label={`Usuń ${asset.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Brak aktywów.</p>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-foreground text-sm font-semibold">Zobowiązania</h3>
            <button
              type="button"
              onClick={openCreateLiability}
              disabled={actionLoading}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg border px-3 py-1 text-sm transition-colors disabled:opacity-50"
            >
              Dodaj zobowiązanie
            </button>
          </div>
          {liabilities.length > 0 ? (
            <ul className="space-y-2">
              {liabilities.map((liability) => (
                <li
                  key={liability.id}
                  className="border-border bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-foreground font-medium">{liability.name}</span>
                    <p className="text-muted-foreground text-sm">{formatPln(liability.amount)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openEditLiability(liability);
                      }}
                      disabled={actionLoading}
                      className="text-primary hover:bg-accent hover:text-primary/80 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                      aria-label={`Edytuj ${liability.name}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteLiability(liability.id, liability.name);
                      }}
                      disabled={actionLoading}
                      className="text-destructive hover:bg-destructive/10 rounded-lg p-1.5 transition-colors disabled:opacity-50"
                      aria-label={`Usuń ${liability.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Brak zobowiązań.</p>
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
