// Tenant-local cron dispatch.
//
// Vercel Cron only fires in UTC and has no per-tenant scheduling. We register
// each job as "hourly UTC" and decide per-tenant whether this hour is the
// target hour in the tenant's local timezone.
//
// Tenant timezone is resolved from the first City linked to any of the
// tenant's studios. Fallback: "Europe/Madrid" (matches the City default).

import { prisma } from "@/lib/db";

export interface TenantLocalContext {
  tenantId: string;
  timezone: string;
  localHour: number;
  localDate: Date; // midnight in the tenant's local timezone, returned as UTC instant
}

export async function listActiveTenantsWithTimezone(): Promise<
  { id: string; timezone: string }[]
> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      studios: {
        select: { city: { select: { timezone: true } } },
        take: 1,
      },
    },
  });
  return tenants.map((t) => ({
    id: t.id,
    timezone: t.studios[0]?.city.timezone ?? "Europe/Madrid",
  }));
}

/**
 * Returns the hour (0-23) in `timezone` for the given instant, using
 * Intl.DateTimeFormat (no extra deps).
 */
export function hourInTimezone(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  const parsed = parseInt(hour, 10);
  // Intl may return "24" at midnight in some locales; normalize to 0.
  return parsed === 24 ? 0 : parsed;
}

/**
 * Returns the wall-clock date (year-month-day) in `timezone` for the given
 * instant, as a Date at 00:00 local time expressed in UTC for DB storage.
 */
export function localDateInTimezone(instant: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

/**
 * Pick tenants whose local clock is at the target hour right now.
 */
export async function tenantsAtLocalHour(
  targetHour: number,
  now: Date = new Date(),
): Promise<TenantLocalContext[]> {
  const tenants = await listActiveTenantsWithTimezone();
  return tenants
    .map((t) => ({
      tenantId: t.id,
      timezone: t.timezone,
      localHour: hourInTimezone(now, t.timezone),
      localDate: localDateInTimezone(now, t.timezone),
    }))
    .filter((c) => c.localHour === targetHour);
}

/**
 * Same as above, but picks tenants whose local clock is on day 1 at the
 * target hour — used by monthly_close to fire at the tenant's local 02:00 on
 * the 1st of each month.
 */
export async function tenantsAtMonthlyCloseHour(
  targetHour: number,
  now: Date = new Date(),
): Promise<TenantLocalContext[]> {
  const tenants = await tenantsAtLocalHour(targetHour, now);
  return tenants.filter((c) => {
    const day = c.localDate.getUTCDate();
    return day === 1;
  });
}
