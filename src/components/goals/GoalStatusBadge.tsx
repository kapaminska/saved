import type { GoalStatus } from "@/lib/goals/projection";
import { cn } from "@/lib/utils";

interface Props {
  status: GoalStatus | null;
}

const STATUS_CONFIG: Record<GoalStatus, { label: string; className: string }> = {
  ahead: {
    label: "Ahead",
    className: "border-green-500/40 bg-green-900/30 text-green-300",
  },
  on_track: {
    label: "On track",
    className: "border-blue-500/40 bg-blue-900/30 text-blue-300",
  },
  behind: {
    label: "Behind",
    className: "border-amber-500/40 bg-amber-900/30 text-amber-300",
  },
};

export default function GoalStatusBadge({ status }: Props) {
  if (!status) return null;

  const config = STATUS_CONFIG[status];

  return (
    <span className={cn("inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}
