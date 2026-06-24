import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { PartyPopper } from "lucide-react";

interface Props {
  goalId: string | null;
  goalName: string | null;
}

const CONFETTI_COLORS = ["#d97706", "#f59e0b", "#fb923c", "#fcd34d", "#fef3c7"];

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
      colors: CONFETTI_COLORS,
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
    <div className="bg-foreground/20 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-xl"
      >
        <div className="bg-primary/10 mx-auto mb-4 flex size-14 items-center justify-center rounded-full">
          <PartyPopper className="text-primary size-7" />
        </div>
        <h2 id="celebration-title" className="text-foreground mb-2 text-2xl font-bold">
          Cel osiągnięty!
        </h2>
        <p className="text-muted-foreground mb-6">Gratulacje — {goalName ?? "twój cel"} jest ukończony.</p>
        <button
          type="button"
          onClick={handleDismiss}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-6 py-2 text-sm font-medium transition-colors"
        >
          Świetnie!
        </button>
      </div>
    </div>
  );
}
