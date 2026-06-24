import { useState } from "react";
import { Clock, X } from "lucide-react";

const STORAGE_KEY = "saved-net-worth-stale-dismiss";

interface StaleAsset {
  id: string;
  name: string;
  lastUpdatedAt: string;
}

interface Props {
  stalestAsset: StaleAsset;
  onConfirm: () => void;
  onDismiss: () => void;
}

function readDismissed(asset: StaleAsset): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as { assetId: string; lastUpdatedAt: string };
    return stored.assetId === asset.id && stored.lastUpdatedAt === asset.lastUpdatedAt;
  } catch {
    return false;
  }
}

export default function StaleAssetBanner({ stalestAsset, onConfirm, onDismiss }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const hidden = dismissed || readDismissed(stalestAsset);

  function handleDismiss() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ assetId: stalestAsset.id, lastUpdatedAt: stalestAsset.lastUpdatedAt }),
    );
    setDismissed(true);
    onDismiss();
  }

  if (hidden) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-amber-900">
            <span className="font-medium">{stalestAsset.name}</span> nie był aktualizowany od ponad 3 miesięcy — czy
            kwota jest nadal aktualna?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg border px-3 py-1.5 text-sm transition-colors"
            >
              Nadal aktualne
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="border-border text-muted-foreground hover:bg-accent rounded-lg border px-3 py-1.5 text-sm transition-colors"
            >
              Odrzuć
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-1 transition-colors"
          aria-label="Odrzuć"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
