export type LoyaltyTierVisual = "bronze" | "silver" | "gold" | "platinum" | "elite";

const TIER_BY_ORDER: LoyaltyTierVisual[] = ["bronze", "silver", "gold", "platinum", "elite"];

/**
 * Mapea un nivel al estilo visual del badge.
 * Prioriza sortOrder (0–4 → bronze…elite). Si no se provee,
 * intenta deducirlo del nombre como fallback.
 */
export function getLoyaltyTierVisual(levelName: string, sortOrder?: number): LoyaltyTierVisual {
  if (sortOrder !== undefined) return TIER_BY_ORDER[Math.min(sortOrder, TIER_BY_ORDER.length - 1)];

  const n = levelName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (/\bbronce\b/.test(n) || /\bbronze\b/.test(n)) return "bronze";
  if (/\bplata\b/.test(n) || /\bsilver\b/.test(n)) return "silver";
  if ((/\boro\b/.test(n) || /\bgold\b/.test(n)) && !/\bplat/.test(n)) return "gold";
  if (/\bplatino\b/.test(n) || /\bplatinum\b/.test(n)) return "platinum";
  if (/\belite\b/.test(n)) return "elite";
  return "bronze";
}

export function getLoyaltyTierSubtitle(tier: LoyaltyTierVisual): string {
  const map: Record<LoyaltyTierVisual, string> = {
    bronze: "Nivel I · Entrada",
    silver: "Nivel II · Progreso",
    gold: "Nivel III · Compromiso",
    platinum: "Nivel IV · Maestría",
    elite: "Nivel V · Leyenda",
  };
  return map[tier];
}
