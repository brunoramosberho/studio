import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, getTenantCurrency } from "@/lib/tenant";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const coachProfile = await prisma.coachProfile.findFirst({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { id: true },
    });

    if (!coachProfile) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const now = new Date();

    const weekDay = now.getDay();
    const mondayOffset = weekDay === 0 ? -6 : 1 - weekDay;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    const baseWhere = {
      coachId: coachProfile.id,
      tenantId: tenant.id,
      status: { not: "CANCELLED" as const },
    };

    const [
      weekTotal,
      weekGiven,
      weekStudents,
      monthTotal,
      monthGiven,
      monthStudents,
      yearTotal,
      yearGiven,
      yearStudents,
      allTimeGiven,
      allTimeStudents,
      classHistory,
    ] = await Promise.all([
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: weekStart, lte: weekEnd } },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: weekStart, lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { gte: weekStart, lte: weekEnd } },
        },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: monthStart, lte: monthEnd } },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: monthStart, lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { gte: monthStart, lte: monthEnd } },
        },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: yearStart, lte: yearEnd } },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: yearStart, lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { gte: yearStart, lte: yearEnd } },
        },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { lt: now } },
      }),
      prisma.booking.count({
        where: {
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { ...baseWhere, startsAt: { lt: now } },
        },
      }),
      prisma.class.findMany({
        where: { ...baseWhere },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          classType: { select: { name: true, color: true } },
          room: { select: { maxCapacity: true } },
          _count: {
            select: {
              bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            },
          },
        },
      }),
    ]);

    const [weekEarnings, monthEarnings, classEarnings] = await Promise.all([
      calculateCoachEarnings(coachProfile.id, tenant.id, weekStart, weekEnd),
      calculateCoachEarnings(coachProfile.id, tenant.id, monthStart, monthEnd),
      calculatePerClassEarnings(coachProfile.id, tenant.id, monthStart, monthEnd),
    ]);

    return NextResponse.json({
      week: { total: weekTotal, given: weekGiven, students: weekStudents },
      month: { total: monthTotal, given: monthGiven, students: monthStudents },
      year: { total: yearTotal, given: yearGiven, students: yearStudents },
      allTime: { given: allTimeGiven, students: allTimeStudents },
      earnings: monthEarnings,
      weekEarnings,
      classEarnings,
      history: classHistory.map((c) => ({
        id: c.id,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        className: c.classType.name,
        classColor: c.classType.color,
        capacity: c.room.maxCapacity,
        students: c._count.bookings,
        isPast: new Date(c.startsAt) < now,
      })),
    });
  } catch (error) {
    console.error("GET /api/coach/stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}

async function calculateCoachEarnings(
  coachProfileId: string,
  tenantId: string,
  from: Date,
  to: Date,
) {
  const payRates = await prisma.coachPayRate.findMany({
    where: {
      coachProfileId,
      tenantId,
      isActive: true,
      effectiveFrom: { lte: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
    },
  });

  if (payRates.length === 0) {
    const tenantCurrency = await getTenantCurrency();
    return { total: 0, breakdown: [], currency: tenantCurrency.code, hasRates: false };
  }

  const classes = await prisma.class.findMany({
    where: {
      coachId: coachProfileId,
      tenantId,
      startsAt: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      classTypeId: true,
      startsAt: true,
      tag: true,
      room: { select: { maxCapacity: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
        },
      },
    },
  });

  function getMultiplier(rate: typeof payRates[0], classStartsAt: Date, classTag?: string | null) {
    const bm = rate.bonusMultiplier ?? 1;
    if (bm <= 1) return 1;
    const days = (rate.bonusDays as number[] | null) ?? [];
    const tags = rate.bonusTags ?? [];
    const dayMatch = days.length > 0 && days.includes(classStartsAt.getDay());
    const tagMatch = tags.length > 0 && classTag && tags.includes(classTag);
    return (dayMatch || tagMatch) ? bm : 1;
  }

  let total = 0;
  const breakdown: { type: string; label: string; amount: number }[] = [];

  for (const rate of payRates) {
    const matchingClasses = rate.classTypeId
      ? classes.filter((c) => c.classTypeId === rate.classTypeId)
      : classes;

    switch (rate.type) {
      case "MONTHLY_FIXED": {
        total += rate.amount;
        breakdown.push({ type: "MONTHLY_FIXED", label: "Sueldo fijo", amount: rate.amount });
        break;
      }
      case "PER_CLASS": {
        let amt = 0;
        for (const cls of matchingClasses) {
          amt += rate.amount * getMultiplier(rate, new Date(cls.startsAt), cls.tag);
        }
        total += amt;
        breakdown.push({ type: "PER_CLASS", label: `${matchingClasses.length} clases`, amount: Math.round(amt * 100) / 100 });
        break;
      }
      case "PER_STUDENT": {
        let amt = 0;
        for (const cls of matchingClasses) {
          amt += cls._count.bookings * rate.amount * getMultiplier(rate, new Date(cls.startsAt), cls.tag);
        }
        const totalStudents = matchingClasses.reduce((s, c) => s + c._count.bookings, 0);
        total += amt;
        breakdown.push({ type: "PER_STUDENT", label: `${totalStudents} alumnos`, amount: Math.round(amt * 100) / 100 });
        break;
      }
      case "OCCUPANCY_TIER": {
        const tiers = (rate.occupancyTiers as { min: number; max: number; amount: number }[]) ?? [];
        let tierTotal = 0;
        for (const cls of matchingClasses) {
          const occ = cls.room.maxCapacity > 0
            ? Math.round((cls._count.bookings / cls.room.maxCapacity) * 100)
            : 0;
          const tier = tiers.find((t) => occ >= t.min && occ <= t.max);
          if (tier) {
            tierTotal += tier.amount * getMultiplier(rate, new Date(cls.startsAt), cls.tag);
          }
        }
        total += tierTotal;
        breakdown.push({ type: "OCCUPANCY_TIER", label: "Bono ocupación", amount: Math.round(tierTotal * 100) / 100 });
        break;
      }
    }
  }

  const fallbackCurrency = payRates[0]?.currency ?? (await getTenantCurrency()).code;
  return { total: Math.round(total * 100) / 100, breakdown, currency: fallbackCurrency, hasRates: true };
}

async function calculatePerClassEarnings(
  coachProfileId: string,
  tenantId: string,
  from: Date,
  to: Date,
) {
  const payRates = await prisma.coachPayRate.findMany({
    where: {
      coachProfileId,
      tenantId,
      isActive: true,
      effectiveFrom: { lte: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
    },
  });

  if (payRates.length === 0) return [];

  const classes = await prisma.class.findMany({
    where: {
      coachId: coachProfileId,
      tenantId,
      startsAt: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      classTypeId: true,
      startsAt: true,
      tag: true,
      classType: { select: { name: true, color: true } },
      room: { select: { maxCapacity: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
        },
      },
    },
    orderBy: { startsAt: "desc" },
  });

  function getMultiplier(rate: typeof payRates[0], d: Date, tag?: string | null) {
    const bm = rate.bonusMultiplier ?? 1;
    if (bm <= 1) return 1;
    const days = (rate.bonusDays as number[] | null) ?? [];
    const tags = rate.bonusTags ?? [];
    return ((days.length > 0 && days.includes(d.getDay())) || (tags.length > 0 && tag && tags.includes(tag))) ? bm : 1;
  }

  return classes.map((cls) => {
    let classTotal = 0;
    const d = new Date(cls.startsAt);
    const occ = cls.room.maxCapacity > 0 ? Math.round((cls._count.bookings / cls.room.maxCapacity) * 100) : 0;

    for (const rate of payRates) {
      if (rate.classTypeId && rate.classTypeId !== cls.classTypeId) continue;
      const mult = getMultiplier(rate, d, cls.tag);

      switch (rate.type) {
        case "PER_CLASS":
          classTotal += rate.amount * mult;
          break;
        case "PER_STUDENT":
          classTotal += cls._count.bookings * rate.amount * mult;
          break;
        case "OCCUPANCY_TIER": {
          const tiers = (rate.occupancyTiers as { min: number; max: number; amount: number }[]) ?? [];
          const tier = tiers.find((t) => occ >= t.min && occ <= t.max);
          if (tier) classTotal += tier.amount * mult;
          break;
        }
      }
    }

    return {
      id: cls.id,
      startsAt: cls.startsAt,
      className: cls.classType.name,
      classColor: cls.classType.color,
      students: cls._count.bookings,
      capacity: cls.room.maxCapacity,
      occupancy: occ,
      earned: Math.round(classTotal * 100) / 100,
    };
  });
}
