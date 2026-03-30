"use client";

import { cn } from "@/lib/utils";
import {
  getLoyaltyTierSubtitle,
  getLoyaltyTierVisual,
  type LoyaltyTierVisual,
} from "@/lib/loyalty-tier";

export type LoyaltyTierBadgeSize = "sm" | "md" | "lg";

export interface LoyaltyTierBadgeProps {
  levelName: string;
  icon: string;
  /** Orden del nivel (1–5) para la pastilla derecha */
  sortOrder?: number;
  /** Sustituye el subtítulo por defecto (p. ej. clases + racha) */
  subtitle?: string;
  size?: LoyaltyTierBadgeSize;
  className?: string;
  /** Oculta subtítulo y pastilla (solo nombre + icono) */
  minimal?: boolean;
  /** Muestra la línea tipo "Nivel III · …" (por defecto true salvo que quieras solo nombre + pastilla) */
  showTierSubtitle?: boolean;
}

const tierClass: Record<LoyaltyTierVisual, string> = {
  bronze: "loyalty-tier-badge--bronze",
  silver: "loyalty-tier-badge--silver",
  gold: "loyalty-tier-badge--gold",
  platinum: "loyalty-tier-badge--platinum",
  elite: "loyalty-tier-badge--elite",
};

const sizeClass: Record<LoyaltyTierBadgeSize, string> = {
  sm: "loyalty-tier-badge--sm",
  md: "loyalty-tier-badge--md",
  lg: "loyalty-tier-badge--lg",
};

export function LoyaltyTierBadge({
  levelName,
  icon,
  sortOrder,
  subtitle: subtitleOverride,
  size = "md",
  className,
  minimal = false,
  showTierSubtitle = true,
}: LoyaltyTierBadgeProps) {
  const tier = getLoyaltyTierVisual(levelName);
  const sub = subtitleOverride ?? getLoyaltyTierSubtitle(tier);

  return (
    <div
      className={cn(
        "loyalty-tier-badge group",
        tierClass[tier],
        sizeClass[size],
        minimal && "loyalty-tier-badge--minimal",
        subtitleOverride != null && "loyalty-tier-badge--custom-sub",
        className,
      )}
    >
      <div className="loyalty-tier-badge__inner">
        <span className="loyalty-tier-badge__icon" aria-hidden>
          {icon}
        </span>
        <div className="loyalty-tier-badge__info">
          <span className="loyalty-tier-badge__name">{levelName}</span>
          {!minimal && showTierSubtitle && (
            <span className="loyalty-tier-badge__sub">{sub}</span>
          )}
        </div>
        {!minimal && sortOrder != null && (
          <span className="loyalty-tier-badge__pill">Nv {sortOrder}</span>
        )}
      </div>
    </div>
  );
}
