/**
 * Human label for a package validity window. Only promotes to a bigger unit
 * when the count is EXACT — rounding oversells the window (45 days used to
 * display as "2 months"). 42 → "6 wk", 45 → "45 days", 30/60/90 → months,
 * 365 → "1 year", anything uneven → plain days. 7 days stays "7 days" so no
 * singular week form is needed.
 */
export type ValidDaysUnitKey =
  | "daysUnit"
  | "weeksUnit"
  | "monthUnit"
  | "monthsUnit"
  | "yearUnit"
  | "yearsUnit";

export function formatValidDays(
  days: number,
  t: (key: ValidDaysUnitKey) => string,
): string {
  if (days >= 365 && days % 365 === 0) {
    const y = days / 365;
    return `${y} ${y === 1 ? t("yearUnit") : t("yearsUnit")}`;
  }
  if (days >= 30 && days % 30 === 0) {
    const m = days / 30;
    return `${m} ${m === 1 ? t("monthUnit") : t("monthsUnit")}`;
  }
  if (days > 7 && days % 7 === 0) {
    return `${days / 7} ${t("weeksUnit")}`;
  }
  return `${days} ${t("daysUnit")}`;
}
