"use client";

import { cn } from "@/lib/utils";
import { getLoyaltyTierVisual, type LoyaltyTierVisual } from "@/lib/loyalty-tier";

const tierPin: Record<LoyaltyTierVisual, string> = {
  bronze: "loyalty-level-pin--bronze",
  silver: "loyalty-level-pin--silver",
  gold: "loyalty-level-pin--gold",
  platinum: "loyalty-level-pin--platinum",
  elite: "loyalty-level-pin--elite",
};

export function LoyaltyLevelAvatarPin({
  sortOrder,
  levelName,
  className,
  size = "sm",
}: {
  sortOrder: number;
  levelName: string;
  className?: string;
  /** sm = avatar 64px, md = avatar 80px */
  size?: "sm" | "md";
}) {
  const tier = getLoyaltyTierVisual(levelName);
  return (
    <span
      className={cn(
        "loyalty-level-pin",
        size === "md" && "loyalty-level-pin--md",
        tierPin[tier],
        className,
      )}
      aria-label={`Nivel ${sortOrder}`}
    >
      {sortOrder}
    </span>
  );
}
