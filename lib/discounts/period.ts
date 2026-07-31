import { prisma } from "@/lib/db";
import { getWallClockInZone, zonedWallTimeToUtc } from "@/lib/utils";

/**
 * Period caps on a discount code: "only 10 people a month can use this",
 * renewing on the 1st (or every Monday). Distinct from `maxUses`, which is a
 * lifetime total, and from `maxUsesPerUser`, which is per person.
 *
 * Boundaries are calendar-based in the studio's timezone, so a month resets at
 * local midnight on the 1st — not at UTC midnight, which for Madrid would flip
 * two hours early.
 */

export type UsagePeriod = "week" | "month";

export function isUsagePeriod(value: unknown): value is UsagePeriod {
  return value === "week" || value === "month";
}

/** Start of the calendar period containing `now`, as a UTC instant. */
export function currentPeriodStart(
  period: UsagePeriod,
  now: Date,
  timeZone: string,
): Date {
  const wall = getWallClockInZone(now, timeZone);
  if (period === "month") {
    return zonedWallTimeToUtc(wall.year, wall.month - 1, 1, 0, 0, timeZone);
  }
  // ISO week: back up to Monday of the local date.
  const localNoon = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, 12));
  const isoDow = (localNoon.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(localNoon);
  monday.setUTCDate(monday.getUTCDate() - isoDow);
  return zonedWallTimeToUtc(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate(),
    0,
    0,
    timeZone,
  );
}

/** Human label for the error message shown when the cap is hit. */
export function periodLabel(period: UsagePeriod): string {
  return period === "week" ? "esta semana" : "este mes";
}

/**
 * How many times the code was redeemed in the current period, or null when it
 * has no period cap configured.
 */
export async function periodUsageCount(
  discount: { id: string; maxUsesPerPeriod: number | null; usagePeriod: string | null },
  now: Date,
  timeZone: string,
): Promise<{ used: number; max: number; period: UsagePeriod } | null> {
  if (discount.maxUsesPerPeriod == null || !isUsagePeriod(discount.usagePeriod)) {
    return null;
  }
  const start = currentPeriodStart(discount.usagePeriod, now, timeZone);
  const used = await prisma.discountRedemption.count({
    where: { discountCodeId: discount.id, createdAt: { gte: start } },
  });
  return { used, max: discount.maxUsesPerPeriod, period: discount.usagePeriod };
}
