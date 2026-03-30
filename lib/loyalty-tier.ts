export type LoyaltyTierVisual = "bronze" | "silver" | "gold" | "platinum" | "elite";

/** Mapea nombre de nivel (ES/EN) al estilo visual del badge. */
export function getLoyaltyTierVisual(levelName: string): LoyaltyTierVisual {
  const n = levelName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (n.includes("bronce") || n.includes("bronze")) return "bronze";
  if (n.includes("plata") || n.includes("silver")) return "silver";
  if ((n.includes("oro") || n.includes("gold")) && !n.includes("plat")) return "gold";
  if (n.includes("platino") || n.includes("platinum")) return "platinum";
  if (n.includes("elite")) return "elite";
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
