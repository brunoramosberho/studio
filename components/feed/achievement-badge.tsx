"use client";

import { cn } from "@/lib/utils";
import { ACHIEVEMENT_DEFS } from "@/lib/achievements";

const achievementStyles: Record<
  string,
  { gradient: string; ring: string; bg: string; text: string; glow: string }
> = {
  FIRST_CLASS: {
    gradient: "from-amber-400 via-yellow-300 to-orange-400",
    ring: "ring-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    glow: "shadow-amber-200/50",
  },
  FIRST_CLASS_TYPE_REFORMER: {
    gradient: "from-violet-500 via-purple-400 to-fuchsia-500",
    ring: "ring-violet-200",
    bg: "bg-violet-50",
    text: "text-violet-800",
    glow: "shadow-violet-200/50",
  },
  FIRST_CLASS_TYPE_MAT: {
    gradient: "from-emerald-400 via-green-400 to-teal-500",
    ring: "ring-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    glow: "shadow-emerald-200/50",
  },
  FIRST_CLASS_TYPE_BARRE: {
    gradient: "from-pink-400 via-rose-400 to-red-400",
    ring: "ring-pink-200",
    bg: "bg-pink-50",
    text: "text-pink-800",
    glow: "shadow-pink-200/50",
  },
  MILESTONE_5: {
    gradient: "from-sky-400 via-blue-400 to-indigo-500",
    ring: "ring-sky-200",
    bg: "bg-sky-50",
    text: "text-sky-800",
    glow: "shadow-sky-200/50",
  },
  MILESTONE_10: {
    gradient: "from-cyan-400 via-teal-400 to-emerald-500",
    ring: "ring-cyan-200",
    bg: "bg-cyan-50",
    text: "text-cyan-800",
    glow: "shadow-cyan-200/50",
  },
  MILESTONE_25: {
    gradient: "from-amber-500 via-orange-400 to-red-500",
    ring: "ring-amber-200",
    bg: "bg-amber-50",
    text: "text-amber-800",
    glow: "shadow-amber-200/50",
  },
  MILESTONE_50: {
    gradient: "from-orange-500 via-red-500 to-rose-600",
    ring: "ring-orange-200",
    bg: "bg-orange-50",
    text: "text-orange-800",
    glow: "shadow-orange-200/50",
  },
  MILESTONE_100: {
    gradient: "from-yellow-400 via-amber-500 to-yellow-600",
    ring: "ring-yellow-300",
    bg: "bg-yellow-50",
    text: "text-yellow-900",
    glow: "shadow-yellow-300/50",
  },
  STREAK_7: {
    gradient: "from-red-500 via-orange-500 to-amber-500",
    ring: "ring-red-200",
    bg: "bg-red-50",
    text: "text-red-800",
    glow: "shadow-red-200/50",
  },
  STREAK_30: {
    gradient: "from-purple-600 via-violet-500 to-indigo-600",
    ring: "ring-purple-200",
    bg: "bg-purple-50",
    text: "text-purple-800",
    glow: "shadow-purple-200/50",
  },
  EARLY_BIRD: {
    gradient: "from-sky-300 via-blue-300 to-indigo-400",
    ring: "ring-sky-200",
    bg: "bg-sky-50",
    text: "text-sky-800",
    glow: "shadow-sky-200/50",
  },
  NIGHT_OWL: {
    gradient: "from-indigo-600 via-purple-600 to-violet-700",
    ring: "ring-indigo-200",
    bg: "bg-indigo-50",
    text: "text-indigo-800",
    glow: "shadow-indigo-200/50",
  },
  WEEK_WARRIOR: {
    gradient: "from-emerald-500 via-green-500 to-lime-500",
    ring: "ring-emerald-200",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    glow: "shadow-emerald-200/50",
  },
};

const defaultStyle = {
  gradient: "from-gray-400 via-slate-400 to-gray-500",
  ring: "ring-gray-200",
  bg: "bg-gray-50",
  text: "text-gray-800",
  glow: "shadow-gray-200/50",
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
  const style = achievementStyles[type] ?? defaultStyle;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-medium",
        style.bg,
        style.text,
        "border-transparent",
        size === "sm" && "px-2.5 py-1 text-[11px]",
        size === "md" && "px-3.5 py-1.5 text-[13px]",
        size === "lg" && "px-4 py-2 text-sm",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md",
          style.gradient,
          style.glow,
          size === "sm" && "h-5 w-5 text-[10px]",
          size === "md" && "h-6 w-6 text-[12px]",
          size === "lg" && "h-7 w-7 text-[14px]",
        )}
      >
        {def.icon}
      </span>
      <span>{def.label}</span>
    </div>
  );
}

interface AchievementIllustrationProps {
  type: string;
  className?: string;
}

export function AchievementIllustration({
  type,
  className,
}: AchievementIllustrationProps) {
  const def = ACHIEVEMENT_DEFS[type] ?? {
    label: type,
    icon: "🏆",
    description: "",
  };
  const style = achievementStyles[type] ?? defaultStyle;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-5",
        style.bg,
        className,
      )}
    >
      {/* Decorative gradient circle */}
      <div
        className={cn(
          "absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-20 blur-xl",
          style.gradient,
        )}
      />
      <div
        className={cn(
          "absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-gradient-to-br opacity-15 blur-lg",
          style.gradient,
        )}
      />

      <div className="relative flex items-center gap-4">
        {/* Icon circle */}
        <div
          className={cn(
            "flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl text-white shadow-lg",
            style.gradient,
            style.glow,
          )}
        >
          {def.icon}
        </div>

        {/* Text */}
        <div>
          <p className={cn("text-[15px] font-bold", style.text)}>
            {def.label}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">
            {def.description}
          </p>
        </div>
      </div>
    </div>
  );
}
