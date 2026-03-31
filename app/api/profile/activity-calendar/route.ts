import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { startOfWeek, subWeeks, isAfter, isBefore, startOfDay } from "date-fns";

export async function GET(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;

    const yearParam = request.nextUrl.searchParams.get("year");
    const monthParam = request.nextUrl.searchParams.get("month");

    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) - 1 : now.getMonth();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const bookings = await prisma.booking.findMany({
      where: {
        userId,
        tenantId: tenant.id,
        status: "ATTENDED",
        class: {
          startsAt: { gte: monthStart, lte: monthEnd },
        },
      },
      include: {
        class: {
          select: {
            startsAt: true,
            classType: {
              select: { name: true, icon: true, color: true },
            },
          },
        },
      },
      orderBy: { class: { startsAt: "asc" } },
    });

    const activitiesByDate: Record<
      string,
      { name: string; icon: string | null; color: string }[]
    > = {};

    for (const b of bookings) {
      const dateKey = b.class.startsAt.toISOString().slice(0, 10);
      if (!activitiesByDate[dateKey]) activitiesByDate[dateKey] = [];
      activitiesByDate[dateKey].push({
        name: b.class.classType.name,
        icon: b.class.classType.icon,
        color: b.class.classType.color,
      });
    }

    // Weekly streak: consecutive weeks (Mon-Sun) with at least 1 attended class
    const allAttended = await prisma.booking.findMany({
      where: { userId, tenantId: tenant.id, status: "ATTENDED" },
      select: { class: { select: { startsAt: true } } },
      orderBy: { class: { startsAt: "desc" } },
    });

    const attendedWeeks = new Set<string>();
    for (const b of allAttended) {
      const ws = startOfWeek(new Date(b.class.startsAt), { weekStartsOn: 1 });
      attendedWeeks.add(ws.toISOString().slice(0, 10));
    }

    let weekStreak = 0;
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    let checkWeek = thisWeekStart;

    // Allow current week to not have a class yet
    if (!attendedWeeks.has(checkWeek.toISOString().slice(0, 10))) {
      checkWeek = subWeeks(checkWeek, 1);
    }

    while (attendedWeeks.has(checkWeek.toISOString().slice(0, 10))) {
      weekStreak++;
      checkWeek = subWeeks(checkWeek, 1);
    }

    // Which calendar weeks of this month had at least one class
    const weeksWithActivity: string[] = [];
    const seen = new Set<string>();
    for (const b of bookings) {
      const ws = startOfWeek(new Date(b.class.startsAt), { weekStartsOn: 1 });
      const key = ws.toISOString().slice(0, 10);
      if (!seen.has(key)) {
        seen.add(key);
        weeksWithActivity.push(key);
      }
    }

    return NextResponse.json({
      year,
      month: month + 1,
      activities: activitiesByDate,
      weekStreak,
      weeksWithActivity,
    });
  } catch (error) {
    console.error("GET /api/profile/activity-calendar error:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity calendar" },
      { status: 500 },
    );
  }
}
