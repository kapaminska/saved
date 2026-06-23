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
    <div className="mb-4 rounded-xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-blue-200/80" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-blue-100/90">
            <span className="font-medium text-white">{stalestAsset.name}</span> hasn&apos;t been updated in over 3
            months — still accurate?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-lg border border-purple-400/40 bg-purple-900/30 px-3 py-1.5 text-sm text-purple-200 transition-colors hover:bg-purple-900/50"
            >
              Still current
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-blue-100/80 transition-colors hover:bg-white/10"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg p-1 text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
