import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const coach = await prisma.coachProfile.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            phone: true,
            instagramUser: true,
            createdAt: true,
          },
        },
        payRates: {
          where: { isActive: true },
          include: { classType: { select: { id: true, name: true, color: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const baseWhere = {
      coachId: id,
      tenantId: ctx.tenant.id,
      status: { not: "CANCELLED" as const },
    };

    const [
      classesThisMonth,
      classesThisYear,
      allTimeClasses,
      recentClasses,
      upcomingClasses,
    ] = await Promise.all([
      prisma.class.findMany({
        where: { ...baseWhere, startsAt: { gte: monthStart, lte: monthEnd } },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          classType: { select: { id: true, name: true, color: true } },
          room: { select: { name: true, maxCapacity: true, studio: { select: { name: true } } } },
          _count: {
            select: {
              bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            },
          },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { gte: yearStart, lte: now } },
      }),
      prisma.class.count({
        where: { ...baseWhere, startsAt: { lt: now } },
      }),
      prisma.class.findMany({
        where: { ...baseWhere, startsAt: { lt: now } },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          classType: { select: { id: true, name: true, color: true } },
          room: { select: { name: true, maxCapacity: true, studio: { select: { name: true } } } },
          _count: {
            select: {
              bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            },
          },
        },
        orderBy: { startsAt: "desc" },
        take: 50,
      }),
      prisma.class.findMany({
        where: {
          ...baseWhere,
          startsAt: { gt: now },
          status: "SCHEDULED",
        },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          classType: { select: { id: true, name: true, color: true } },
          room: { select: { name: true, maxCapacity: true, studio: { select: { name: true } } } },
          _count: {
            select: {
              bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            },
          },
        },
        orderBy: { startsAt: "asc" },
        take: 20,
      }),
    ]);

    const monthClassCount = classesThisMonth.length;
    let totalOccupancy = 0;
    let classesWithCap = 0;
    let totalStudentsMonth = 0;
    for (const cls of classesThisMonth) {
      totalStudentsMonth += cls._count.bookings;
      if (cls.room.maxCapacity > 0) {
        totalOccupancy += cls._count.bookings / cls.room.maxCapacity;
        classesWithCap++;
      }
    }
    const avgOccupancy = classesWithCap > 0 ? Math.round((totalOccupancy / classesWithCap) * 100) : 0;

    const uniqueStudentsMonth = await prisma.booking.findMany({
      where: {
        status: { in: ["CONFIRMED", "ATTENDED"] },
        class: { coachId: id, tenantId: ctx.tenant.id, startsAt: { gte: monthStart, lte: monthEnd } },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const allTimeStudents = await prisma.booking.findMany({
      where: {
        status: { in: ["CONFIRMED", "ATTENDED"] },
        class: { coachId: id, tenantId: ctx.tenant.id, startsAt: { lt: now } },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const noShowCount = await prisma.booking.count({
      where: {
        status: "NO_SHOW",
        class: { coachId: id, tenantId: ctx.tenant.id, startsAt: { gte: monthStart, lte: monthEnd } },
      },
    });

    const totalBookingsMonth = totalStudentsMonth + noShowCount;
    const noShowRate = totalBookingsMonth > 0 ? Math.round((noShowCount / totalBookingsMonth) * 100) : 0;

    const typeBreakdown = new Map<string, { name: string; color: string; count: number; students: number }>();
    for (const cls of classesThisMonth) {
      const key = cls.classType.id;
      const existing = typeBreakdown.get(key) ?? { name: cls.classType.name, color: cls.classType.color, count: 0, students: 0 };
      existing.count++;
      existing.students += cls._count.bookings;
      typeBreakdown.set(key, existing);
    }

    const earnings = await calculateEarnings(id, ctx.tenant.id, monthStart, monthEnd);

    const formatClass = (cls: any) => ({
      id: cls.id,
      startsAt: cls.startsAt,
      endsAt: cls.endsAt,
      status: cls.status,
      classTypeName: cls.classType.name,
      classTypeColor: cls.classType.color,
      classTypeId: cls.classType.id,
      roomName: cls.room.name,
      studioName: cls.room.studio.name,
      capacity: cls.room.maxCapacity,
      booked: cls._count.bookings,
      occupancy: cls.room.maxCapacity > 0 ? Math.round((cls._count.bookings / cls.room.maxCapacity) * 100) : 0,
    });

    return NextResponse.json({
      id: coach.id,
      userId: coach.user.id,
      bio: coach.bio,
      specialties: coach.specialties,
      photoUrl: coach.photoUrl,
      color: coach.color,
      user: coach.user,
      payRates: coach.payRates,
      stats: {
        classesThisMonth: monthClassCount,
        classesThisYear,
        allTimeClasses,
        avgOccupancy,
        totalStudentsMonth,
        uniqueStudentsMonth: uniqueStudentsMonth.length,
        allTimeStudents: allTimeStudents.length,
        noShowRate,
        earningsThisMonth: earnings,
      },
      typeBreakdown: Array.from(typeBreakdown.entries()).map(([id, data]) => ({ id, ...data })),
      upcomingClasses: upcomingClasses.map(formatClass),
      recentClasses: recentClasses.map(formatClass),
    });
  } catch (error) {
    console.error("GET /api/admin/coaches/[id] error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

async function calculateEarnings(
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

  if (payRates.length === 0) return { total: 0, breakdown: [], currency: "MXN" };

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
        breakdown.push({ type: "MONTHLY_FIXED", label: "Sueldo fijo mensual", amount: rate.amount });
        break;
      }
      case "PER_CLASS": {
        let amt = 0;
        for (const cls of matchingClasses) {
          amt += rate.amount * getMultiplier(rate, new Date(cls.startsAt), cls.tag);
        }
        total += amt;
        breakdown.push({ type: "PER_CLASS", label: `$${rate.amount} × ${matchingClasses.length} clases`, amount: Math.round(amt * 100) / 100 });
        break;
      }
      case "PER_STUDENT": {
        let amt = 0;
        for (const cls of matchingClasses) {
          amt += cls._count.bookings * rate.amount * getMultiplier(rate, new Date(cls.startsAt), cls.tag);
        }
        total += amt;
        const totalStudents = matchingClasses.reduce((s, c) => s + c._count.bookings, 0);
        breakdown.push({
          type: "PER_STUDENT",
          label: `$${rate.amount} × ${totalStudents} alumnos`,
          amount: Math.round(amt * 100) / 100,
        });
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
        breakdown.push({
          type: "OCCUPANCY_TIER",
          label: `Bono por ocupación (${matchingClasses.length} clases)`,
          amount: Math.round(tierTotal * 100) / 100,
        });
        break;
      }
    }
  }

  return { total: Math.round(total * 100) / 100, breakdown, currency: payRates[0]?.currency ?? "MXN" };
}
