import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json([]);

    const withStats = request.nextUrl.searchParams.get("stats") === "true";

    const coaches = await prisma.coachProfile.findMany({
      where: { tenantId: tenant.id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { name: "asc" },
    });

    if (!withStats) {
      return NextResponse.json(coaches);
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Occupancy should reflect only classes that have already taken place. Future
    // classes are still filling up (and may be beyond the booking horizon), so
    // counting them would unfairly drag the average down.
    const coachIds = coaches.map((c) => c.id);

    const classesThisMonthRaw = await prisma.class.findMany({
      where: {
        coachId: { in: coachIds },
        tenantId: tenant.id,
        startsAt: { gte: monthStart, lte: monthEnd },
        status: { in: ["SCHEDULED", "COMPLETED"] },
      },
      select: {
        id: true,
        coachId: true,
        startsAt: true,
        status: true,
        classType: { select: { name: true, color: true } },
        room: { select: { maxCapacity: true } },
        _count: {
          select: {
            // Billable seats — consistent with the coach detail page + pay
            // (see lib/coach/pay.ts): booked/attended, a forfeited credit (no-show
            // or late cancel), or a charged no-show fee.
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
    });

    const upcomingClasses = await prisma.class.findMany({
      where: {
        coachId: { in: coachIds },
        tenantId: tenant.id,
        startsAt: { gt: now },
        status: "SCHEDULED",
      },
      select: {
        id: true,
        coachId: true,
        startsAt: true,
        classType: { select: { name: true, color: true } },
        room: {
          select: {
            name: true,
            maxCapacity: true,
            studio: { select: { name: true } },
          },
        },
        _count: {
          select: {
            // Billable seats — consistent with the coach detail page + pay
            // (see lib/coach/pay.ts): booked/attended, a forfeited credit (no-show
            // or late cancel), or a charged no-show fee.
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
    });

    const statsMap = new Map<string, {
      classesThisMonth: number;
      avgOccupancy: number;
      disciplines: { name: string; color: string }[];
      upcomingClasses: {
        id: string;
        startsAt: Date;
        classTypeName: string;
        classTypeColor: string;
        roomName: string;
        studioName: string;
        booked: number;
        capacity: number;
      }[];
    }>();

    for (const cId of coachIds) {
      const coachClasses = classesThisMonthRaw.filter((c) => c.coachId === cId);
      const classCount = coachClasses.length;

      let totalOccupancy = 0;
      let classesWithCapacity = 0;
      for (const cls of coachClasses) {
        // Only count classes that have already taken place — skip future ones.
        if (cls.startsAt >= now) continue;
        if (cls.room.maxCapacity > 0) {
          // Cap at capacity — a forfeited seat that gets rebooked would otherwise
          // push occupancy past 100%.
          totalOccupancy += Math.min(cls._count.bookings, cls.room.maxCapacity) / cls.room.maxCapacity;
          classesWithCapacity++;
        }
      }
      const avgOccupancy = classesWithCapacity > 0
        ? Math.round((totalOccupancy / classesWithCapacity) * 100)
        : 0;

      const disciplineMap = new Map<string, string>();
      for (const cls of coachClasses) {
        disciplineMap.set(cls.classType.name, cls.classType.color);
      }
      const upcomingForCoach = upcomingClasses.filter((c) => c.coachId === cId);
      for (const cls of upcomingForCoach) {
        disciplineMap.set(cls.classType.name, cls.classType.color);
      }
      const disciplines = Array.from(disciplineMap.entries()).map(([name, color]) => ({ name, color }));

      const coachUpcoming = upcomingForCoach
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          startsAt: c.startsAt,
          classTypeName: c.classType.name,
          classTypeColor: c.classType.color,
          roomName: c.room.name,
          studioName: c.room.studio.name,
          booked: c._count.bookings,
          capacity: c.room.maxCapacity,
        }));

      statsMap.set(cId, {
        classesThisMonth: classCount,
        avgOccupancy,
        disciplines,
        upcomingClasses: coachUpcoming,
      });
    }

    const result = coaches.map((coach) => ({
      ...coach,
      stats: statsMap.get(coach.id) ?? {
        classesThisMonth: 0,
        avgOccupancy: 0,
        disciplines: [],
        upcomingClasses: [],
      },
    }));

    result.sort((a, b) => b.stats.avgOccupancy - a.stats.avgOccupancy);

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/coaches error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
