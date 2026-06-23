import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { PartyPopper } from "lucide-react";

interface Props {
  goalId: string | null;
  goalName: string | null;
}

export default function CelebrationModal({ goalId, goalName }: Props) {
  const [open, setOpen] = useState(Boolean(goalId));
  const firedRef = useRef(false);

  useEffect(() => {
    if (!goalId || firedRef.current) return;
    firedRef.current = true;

    void confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.65 },
      ticks: 120,
      gravity: 0.9,
      scalar: 0.9,
    });
  }, [goalId]);

  if (!open || !goalId) return null;

  function handleDismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete("celebrated");
    window.history.replaceState({}, "", url.pathname + url.search);
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        className="w-full max-w-md rounded-2xl border border-white/20 bg-gradient-to-br from-purple-900/90 to-blue-900/90 p-8 text-center text-white shadow-2xl"
      >
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-white/10">
          <PartyPopper className="size-7 text-yellow-300" />
        </div>
        <h2 id="celebration-title" className="mb-2 text-2xl font-bold text-white">
          Cel osiągnięty!
        </h2>
        <p className="mb-6 text-blue-100/90">Gratulacje — {goalName ?? "twój cel"} jest ukończony.</p>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg bg-white/20 px-6 py-2 text-sm font-medium transition-colors hover:bg-white/30"
        >
          Świetnie!
        </button>
      </div>
    </div>
  );
}
