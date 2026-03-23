import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const coachProfile = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!coachProfile) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
          classType: { select: { name: true, color: true, maxCapacity: true } },
          _count: {
            select: {
              bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      week: { total: weekTotal, given: weekGiven, students: weekStudents },
      month: { total: monthTotal, given: monthGiven, students: monthStudents },
      year: { total: yearTotal, given: yearGiven, students: yearStudents },
      allTime: { given: allTimeGiven, students: allTimeStudents },
      history: classHistory.map((c) => ({
        id: c.id,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        className: c.classType.name,
        classColor: c.classType.color,
        capacity: c.classType.maxCapacity,
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
