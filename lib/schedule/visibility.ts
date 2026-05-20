import type { Tenant } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getWallClockInZone, zonedWallTimeToUtc } from "@/lib/utils";

const FALLBACK_TIMEZONE = "Europe/Madrid";

export type ScheduleVisibilityFields = Pick<
  Tenant,
  | "scheduleVisibilityMode"
  | "visibleScheduleDays"
  | "scheduleReleaseDayOfWeek"
  | "scheduleReleaseHour"
  | "scheduleReleaseWeeksAhead"
  | "scheduleReleaseTimezone"
>;

/**
 * Resolves the IANA timezone used to interpret weekly-release "Sunday 22:00"
 * style configuration. Explicit override on the tenant wins; otherwise we use
 * the city of the primary (createdAt-asc) studio; otherwise Europe/Madrid.
 */
export async function resolveScheduleTimezone(
  tenant: Pick<Tenant, "id" | "scheduleReleaseTimezone">,
): Promise<string> {
  if (tenant.scheduleReleaseTimezone) return tenant.scheduleReleaseTimezone;
  const studio = await prisma.studio.findFirst({
    where: { tenantId: tenant.id },
    orderBy: { id: "asc" },
    select: { city: { select: { timezone: true } } },
  });
  return studio?.city?.timezone ?? FALLBACK_TIMEZONE;
}

/**
 * Returns the UTC instant up to (and including) which the public schedule is
 * visible to clients, given the tenant config and a reference instant.
 *
 * - ROLLING_DAYS: end-of-day in `timezone` of (today + visibleScheduleDays - 1).
 * - WEEKLY_RELEASE: end-of-day in `timezone` of the Sunday of week (M + N),
 *   where M is the ISO week containing the most recent release moment ≤ now,
 *   and N = scheduleReleaseWeeksAhead. This gives a "drop" model: at each
 *   release the visible window jumps forward one more week.
 */
export function computeVisibleUntil(
  now: Date,
  tenant: ScheduleVisibilityFields,
  timezone: string,
): Date {
  if (tenant.scheduleVisibilityMode === "WEEKLY_RELEASE") {
    const dow = tenant.scheduleReleaseDayOfWeek;
    const hour = tenant.scheduleReleaseHour;
    const weeksAhead = tenant.scheduleReleaseWeeksAhead;
    if (dow != null && hour != null && weeksAhead != null) {
      const lastRelease = lastReleaseMomentBefore(now, dow, hour, timezone);
      const lastReleaseSunday = endOfIsoWeekInZone(lastRelease, timezone);
      return addDaysInZone(lastReleaseSunday, weeksAhead * 7, timezone);
    }
    // Misconfigured → fall back to rolling.
  }
  const days = Math.max(1, tenant.visibleScheduleDays);
  return addDaysInZone(endOfDayInZone(now, timezone), days - 1, timezone);
}

/** Returns the most recent UTC instant ≤ `now` that lands on (dow, hour:00) in tz. */
function lastReleaseMomentBefore(
  now: Date,
  dow: number,
  hour: number,
  timezone: string,
): Date {
  const wc = getWallClockInZone(now, timezone);
  // Build today's release-of-the-week candidate, then walk back day by day
  // until weekday matches and the moment is ≤ now.
  let candidate = zonedWallTimeToUtc(wc.year, wc.month - 1, wc.day, hour, 0, timezone);
  let candidateWc = getWallClockInZone(candidate, timezone);
  for (let i = 0; i < 8; i++) {
    if (candidateWc.weekday === dow && candidate.getTime() <= now.getTime()) {
      return candidate;
    }
    candidate = addDaysInZone(candidate, -1, timezone);
    candidateWc = getWallClockInZone(candidate, timezone);
    // Reset hour each iteration to avoid DST drift.
    candidate = zonedWallTimeToUtc(
      candidateWc.year,
      candidateWc.month - 1,
      candidateWc.day,
      hour,
      0,
      timezone,
    );
    candidateWc = getWallClockInZone(candidate, timezone);
  }
  return candidate;
}

/** End of the ISO week (Sunday 23:59:59.999) containing `instant`, expressed in tz. */
function endOfIsoWeekInZone(instant: Date, timezone: string): Date {
  const wc = getWallClockInZone(instant, timezone);
  // ISO week: Monday=1..Sunday=7. JS weekday: Sunday=0..Saturday=6.
  const isoWeekday = wc.weekday === 0 ? 7 : wc.weekday;
  const daysToSunday = 7 - isoWeekday;
  const sundayMidnight = addDaysInZone(
    zonedWallTimeToUtc(wc.year, wc.month - 1, wc.day, 0, 0, timezone),
    daysToSunday,
    timezone,
  );
  return endOfDayInZone(sundayMidnight, timezone);
}

function endOfDayInZone(instant: Date, timezone: string): Date {
  const wc = getWallClockInZone(instant, timezone);
  // 23:59:59.999 isn't representable through zonedWallTimeToUtc (no second/ms
  // arg); use next day 00:00 minus 1ms.
  const nextMidnight = addDaysInZone(
    zonedWallTimeToUtc(wc.year, wc.month - 1, wc.day, 0, 0, timezone),
    1,
    timezone,
  );
  return new Date(nextMidnight.getTime() - 1);
}

function addDaysInZone(instant: Date, days: number, timezone: string): Date {
  const wc = getWallClockInZone(instant, timezone);
  return zonedWallTimeToUtc(wc.year, wc.month - 1, wc.day + days, wc.hour, wc.minute, timezone);
}
