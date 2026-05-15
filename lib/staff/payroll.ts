import { prisma } from "@/lib/db";

// All money in this module is cents (integer). The caller is responsible for
// formatting via lib/currency.formatMoney.

export interface PayrollPeriod {
  // ISO date strings (start inclusive, end exclusive).
  from: Date;
  to: Date;
  // Human label, e.g. "2026-05".
  label: string;
}

// Build a calendar-month period (first millisecond of the month to first
// millisecond of the next month). Times are in the server's local zone;
// this is fine for monthly bucketing where exact tz boundaries don't move
// many shifts and double-clicking from admin always shows source rows.
export function monthPeriod(year: number, monthIndex: number): PayrollPeriod {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const to = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  const label = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return { from, to, label };
}

export function currentMonthPeriod(): PayrollPeriod {
  const now = new Date();
  return monthPeriod(now.getFullYear(), now.getMonth());
}

export interface StaffPayrollLine {
  userId: string;
  userName: string | null;
  userEmail: string;
  // Hours computed from shifts (CLOSED, AUTO_CLOSED, EDITED — excludes VOIDED
  // and still-OPEN). Decimal hours, rounded to 2dp.
  totalHours: number;
  // Hourly earnings broken down per studio (each studio applies its own rate
  // if one is configured, else the user's default rate).
  hourlyByStudio: Array<{
    studioId: string;
    studioName: string;
    hours: number;
    rateCents: number | null;
    earnedCents: number;
  }>;
  hourlyTotalCents: number;
  // Sum of every active fixed-monthly rate the user has. If a user has fixed
  // rates configured for multiple studios, they all add up.
  monthlyFixedCents: number;
  monthlyFixedByStudio: Array<{
    studioId: string | null;
    studioName: string | null;
    amountCents: number;
  }>;
  commissionTotalCents: number;
  commissionByStudio: Array<{
    studioId: string | null;
    studioName: string | null;
    amountCents: number;
    count: number;
  }>;
  totalCents: number;
  currency: string;
}

interface PayRateLite {
  id: string;
  userId: string;
  studioId: string | null;
  hourlyRateCents: number | null;
  monthlyFixedCents: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  currency: string;
}

// Pick the rate that was active for a specific user at a specific moment.
// Studio-scoped rates win over null-studio (default) rates at the same time.
function activeRateAt(
  rates: PayRateLite[],
  userId: string,
  studioId: string | null,
  moment: Date,
): PayRateLite | null {
  const candidates = rates.filter(
    (r) =>
      r.userId === userId &&
      r.effectiveFrom <= moment &&
      (r.effectiveTo == null || r.effectiveTo >= moment) &&
      (r.studioId === studioId || r.studioId === null),
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    // studio-specific beats default
    if (a.studioId && !b.studioId) return -1;
    if (!a.studioId && b.studioId) return 1;
    // newer effectiveFrom wins
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  });
  return candidates[0];
}

interface BuildArgs {
  tenantId: string;
  period: PayrollPeriod;
  userIds?: string[];
  tenantCurrency: string;
}

// Build payroll for one or more staff members in a given period.
export async function buildPayrollLines(
  args: BuildArgs,
): Promise<StaffPayrollLine[]> {
  const { tenantId, period, userIds, tenantCurrency } = args;

  // 1. Resolve which users we're paying. If no userIds given, every staff
  //    member who either has a pay-rate config OR clocked in during the
  //    period.
  let resolvedIds = userIds;
  if (!resolvedIds || resolvedIds.length === 0) {
    const [ratedUsers, shiftedUsers] = await Promise.all([
      prisma.staffPayRate.findMany({
        where: { tenantId, isActive: true },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.staffShift.findMany({
        where: {
          tenantId,
          status: { in: ["CLOSED", "AUTO_CLOSED", "EDITED"] },
          clockInAt: { gte: period.from, lt: period.to },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);
    const set = new Set<string>();
    ratedUsers.forEach((u) => set.add(u.userId));
    shiftedUsers.forEach((u) => set.add(u.userId));
    resolvedIds = Array.from(set);
  }
  if (resolvedIds.length === 0) return [];

  const [users, shifts, rates, earnings, studios] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: resolvedIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.staffShift.findMany({
      where: {
        tenantId,
        userId: { in: resolvedIds },
        status: { in: ["CLOSED", "AUTO_CLOSED", "EDITED"] },
        clockInAt: { gte: period.from, lt: period.to },
      },
      select: {
        userId: true,
        studioId: true,
        clockInAt: true,
        durationMinutes: true,
      },
    }),
    prisma.staffPayRate.findMany({
      where: {
        tenantId,
        userId: { in: resolvedIds },
        isActive: true,
        effectiveFrom: { lte: period.to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.from } }],
      },
    }),
    prisma.staffCommissionEarning.findMany({
      where: {
        tenantId,
        userId: { in: resolvedIds },
        status: { in: ["EARNED", "PAID"] },
        occurredAt: { gte: period.from, lt: period.to },
      },
      select: {
        userId: true,
        studioId: true,
        commissionAmountCents: true,
      },
    }),
    prisma.studio.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const studioName = new Map(studios.map((s) => [s.id, s.name] as const));
  const linesByUser = new Map<string, StaffPayrollLine>();

  for (const u of users) {
    linesByUser.set(u.id, {
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      totalHours: 0,
      hourlyByStudio: [],
      hourlyTotalCents: 0,
      monthlyFixedCents: 0,
      monthlyFixedByStudio: [],
      commissionTotalCents: 0,
      commissionByStudio: [],
      totalCents: 0,
      currency: tenantCurrency,
    });
  }

  // 2. Hourly: aggregate minutes per (user, studio), apply rate-per-shift.
  const hourlyAcc = new Map<
    string,
    { userId: string; studioId: string; minutes: number; earnedCents: number; rateCents: number | null }
  >();
  for (const shift of shifts) {
    if (!shift.durationMinutes) continue;
    const rate = activeRateAt(rates as PayRateLite[], shift.userId, shift.studioId, shift.clockInAt);
    const rateCents = rate?.hourlyRateCents ?? null;
    const earnedCents =
      rateCents != null
        ? Math.round((shift.durationMinutes / 60) * rateCents)
        : 0;
    const key = `${shift.userId}::${shift.studioId}`;
    const existing = hourlyAcc.get(key);
    if (existing) {
      existing.minutes += shift.durationMinutes;
      existing.earnedCents += earnedCents;
    } else {
      hourlyAcc.set(key, {
        userId: shift.userId,
        studioId: shift.studioId,
        minutes: shift.durationMinutes,
        earnedCents,
        rateCents,
      });
    }
  }
  for (const agg of hourlyAcc.values()) {
    const line = linesByUser.get(agg.userId);
    if (!line) continue;
    const hours = Number((agg.minutes / 60).toFixed(2));
    line.hourlyByStudio.push({
      studioId: agg.studioId,
      studioName: studioName.get(agg.studioId) ?? "—",
      hours,
      rateCents: agg.rateCents,
      earnedCents: agg.earnedCents,
    });
    line.totalHours = Number((line.totalHours + hours).toFixed(2));
    line.hourlyTotalCents += agg.earnedCents;
  }

  // 3. Monthly fixed: every active fixed-rate row contributes its full amount
  //    once per period. (If you want pro-rating, compute by elapsed days here.)
  for (const rate of rates) {
    if (!rate.monthlyFixedCents || rate.monthlyFixedCents <= 0) continue;
    // Only include if rate overlaps the period at all (already filtered by query).
    const line = linesByUser.get(rate.userId);
    if (!line) continue;
    line.monthlyFixedCents += rate.monthlyFixedCents;
    line.monthlyFixedByStudio.push({
      studioId: rate.studioId,
      studioName: rate.studioId ? studioName.get(rate.studioId) ?? "—" : null,
      amountCents: rate.monthlyFixedCents,
    });
  }

  // 4. Commissions
  const commAcc = new Map<
    string,
    { userId: string; studioId: string | null; amountCents: number; count: number }
  >();
  for (const e of earnings) {
    const key = `${e.userId}::${e.studioId ?? "_"}`;
    const existing = commAcc.get(key);
    if (existing) {
      existing.amountCents += e.commissionAmountCents;
      existing.count += 1;
    } else {
      commAcc.set(key, {
        userId: e.userId,
        studioId: e.studioId,
        amountCents: e.commissionAmountCents,
        count: 1,
      });
    }
  }
  for (const c of commAcc.values()) {
    const line = linesByUser.get(c.userId);
    if (!line) continue;
    line.commissionByStudio.push({
      studioId: c.studioId,
      studioName: c.studioId ? studioName.get(c.studioId) ?? "—" : null,
      amountCents: c.amountCents,
      count: c.count,
    });
    line.commissionTotalCents += c.amountCents;
  }

  // 5. Totals
  for (const line of linesByUser.values()) {
    line.totalCents =
      line.hourlyTotalCents + line.monthlyFixedCents + line.commissionTotalCents;
  }

  return Array.from(linesByUser.values()).sort((a, b) =>
    (a.userName ?? a.userEmail).localeCompare(b.userName ?? b.userEmail),
  );
}
