import type { GoalStatus } from "@/lib/goals/projection";
import { cn } from "@/lib/utils";

interface Props {
  status: GoalStatus | null;
}

const STATUS_CONFIG: Record<GoalStatus, { label: string; className: string }> = {
  ahead: {
    label: "Z wyprzedzeniem",
    className: "border-green-200 bg-green-100 text-green-800",
  },
  on_track: {
    label: "Na dobrej drodze",
    className: "border-blue-200 bg-blue-100 text-blue-800",
  },
  behind: {
    label: "Z tyłu",
    className: "border-amber-200 bg-amber-100 text-amber-800",
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
