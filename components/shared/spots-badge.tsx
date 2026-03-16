import { cn, getSpotStatus, getSpotColor } from "@/lib/utils";

interface SpotsBadgeProps {
  spotsLeft: number;
  maxCapacity: number;
  className?: string;
}

export function SpotsBadge({ spotsLeft, maxCapacity, className }: SpotsBadgeProps) {
  const status = getSpotStatus(spotsLeft, maxCapacity);
  const colorClass = getSpotColor(status);

  if (status === "full") {
    return (
      <span className={cn("font-mono text-xs font-medium text-muted", className)}>
        Lista de espera
      </span>
    );
  }

  return (
    <span className={cn("font-mono text-xs font-medium", colorClass, className)}>
      {spotsLeft} {spotsLeft === 1 ? "lugar" : "lugares"}
    </span>
  );
}
