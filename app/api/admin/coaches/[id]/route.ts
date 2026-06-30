import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getTenantCurrency } from "@/lib/tenant";
import { computeCoachPay } from "@/lib/coach/pay";

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
              // Billable seats — the studio earned from these (see lib/coach/pay.ts):
              // booked/attended, a forfeited credit (no-show or late cancel), or a
              // charged no-show fee. Keeps occupancy consistent with what's paid.
              bookings: {
                where: {
                  OR: [
                    { status: { in: ["CONFIRMED", "ATTENDED"] } },
                    { status: { in: ["NO_SHOW", "CANCELLED"] }, creditLost: true },
                    { status: "NO_SHOW", pendingPenalty: { is: { status: "confirmed", chargeFee: true } } },
                  ],
                },
              },
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
              // Billable seats — the studio earned from these (see lib/coach/pay.ts):
              // booked/attended, a forfeited credit (no-show or late cancel), or a
              // charged no-show fee. Keeps occupancy consistent with what's paid.
              bookings: {
                where: {
                  OR: [
                    { status: { in: ["CONFIRMED", "ATTENDED"] } },
                    { status: { in: ["NO_SHOW", "CANCELLED"] }, creditLost: true },
                    { status: "NO_SHOW", pendingPenalty: { is: { status: "confirmed", chargeFee: true } } },
                  ],
                },
              },
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
              // Billable seats — the studio earned from these (see lib/coach/pay.ts):
              // booked/attended, a forfeited credit (no-show or late cancel), or a
              // charged no-show fee. Keeps occupancy consistent with what's paid.
              bookings: {
                where: {
                  OR: [
                    { status: { in: ["CONFIRMED", "ATTENDED"] } },
                    { status: { in: ["NO_SHOW", "CANCELLED"] }, creditLost: true },
                    { status: "NO_SHOW", pendingPenalty: { is: { status: "confirmed", chargeFee: true } } },
                  ],
                },
              },
            },
          },
        },
        orderBy: { startsAt: "asc" },
        take: 20,
      }),
    ]);

    const monthClassCount = classesThisMonth.length;
    // Cap billable seats at room capacity — a forfeited seat that gets rebooked
    // would otherwise double-count and push occupancy past 100%.
    const billableOf = (cls: {
      _count: { bookings: number };
      room: { maxCapacity: number };
    }) =>
      cls.room.maxCapacity > 0
        ? Math.min(cls._count.bookings, cls.room.maxCapacity)
        : cls._count.bookings;
    let totalOccupancy = 0;
    let classesWithCap = 0;
    let totalStudentsMonth = 0;
    for (const cls of classesThisMonth) {
      const billable = billableOf(cls);
      totalStudentsMonth += billable;
      if (cls.room.maxCapacity > 0) {
        totalOccupancy += billable / cls.room.maxCapacity;
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
    // No-show rate is a frequency over real attendance opportunities, so its
    // denominator stays physical (attended + no-shows) — independent of the
    // billable seat count used for occupancy/pay.
    const attendedBookingsMonth = await prisma.booking.count({
      where: {
        status: { in: ["CONFIRMED", "ATTENDED"] },
        class: { coachId: id, tenantId: ctx.tenant.id, startsAt: { gte: monthStart, lte: monthEnd } },
      },
    });

    const totalBookingsMonth = attendedBookingsMonth + noShowCount;
    const noShowRate = totalBookingsMonth > 0 ? Math.round((noShowCount / totalBookingsMonth) * 100) : 0;

    const typeBreakdown = new Map<string, { name: string; color: string; count: number; students: number }>();
    for (const cls of classesThisMonth) {
      const key = cls.classType.id;
      const existing = typeBreakdown.get(key) ?? { name: cls.classType.name, color: cls.classType.color, count: 0, students: 0 };
      existing.count++;
      existing.students += billableOf(cls);
      typeBreakdown.set(key, existing);
    }

    // Pay comes from the single source of truth (lib/coach/pay.ts) so this page
    // matches admin payroll + the instructor's own view.
    const currency = (await getTenantCurrency()).code;
    const pay = await computeCoachPay(id, ctx.tenant.id, monthStart, monthEnd, currency, now);
    const earnings = { total: pay.total, breakdown: pay.breakdown, currency: pay.currency };

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
      booked: billableOf(cls),
      occupancy: cls.room.maxCapacity > 0 ? Math.round((billableOf(cls) / cls.room.maxCapacity) * 100) : 0,
    });

    return NextResponse.json({
      id: coach.id,
      name: coach.name,
      userId: coach.userId,
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;
    const { name, bio, specialties, color } = await request.json();

    const coach = await prisma.coachProfile.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });

    if (!coach) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    const updated = await prisma.coachProfile.update({
      where: { id },
      data: {
        ...(typeof name === "string" && name.trim() && { name: name.trim() }),
        ...(typeof bio === "string" && { bio }),
        ...(Array.isArray(specialties) && { specialties }),
        ...(typeof color === "string" && { color }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/admin/coaches/[id] error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
