"use client";

import { cn } from "@/lib/utils";
import { ACHIEVEMENT_DEFS } from "@/lib/achievements";

const colorMap: Record<string, string> = {
  FIRST_CLASS: "bg-accent/10 text-accent border-accent/20",
  MILESTONE_5: "bg-yellow-50 text-yellow-700 border-yellow-200",
  MILESTONE_10: "bg-yellow-50 text-yellow-700 border-yellow-200",
  MILESTONE_25: "bg-amber-50 text-amber-700 border-amber-200",
  MILESTONE_50: "bg-orange-50 text-orange-700 border-orange-200",
  MILESTONE_100: "bg-rose-50 text-rose-700 border-rose-200",
  STREAK_7: "bg-red-50 text-red-700 border-red-200",
  STREAK_30: "bg-purple-50 text-purple-700 border-purple-200",
  EARLY_BIRD: "bg-sky-50 text-sky-700 border-sky-200",
  NIGHT_OWL: "bg-indigo-50 text-indigo-700 border-indigo-200",
  WEEK_WARRIOR: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

interface AchievementBadgeProps {
  type: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function AchievementBadge({
  type,
  size = "md",
  className,
}: AchievementBadgeProps) {
  const def = ACHIEVEMENT_DEFS[type] ?? {
    label: type,
    icon: "🏆",
    description: "",
  };
  const colors =
    colorMap[type] ?? "bg-surface text-foreground border-border/50";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        colors,
        size === "sm" && "px-2 py-0.5 text-[11px]",
        size === "md" && "px-3 py-1 text-[13px]",
        size === "lg" && "px-4 py-1.5 text-sm",
        className,
      )}
    >
      <span>{def.icon}</span>
      <span>{def.label}</span>
    </div>
  );
}
