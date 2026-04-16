import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;

    const yearParam = request.nextUrl.searchParams.get("year");
    const monthParam = request.nextUrl.searchParams.get("month");
    const tz = request.nextUrl.searchParams.get("tz") || "UTC";

    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) - 1 : now.getMonth();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const toDateKey = (d: Date): string => {
      try {
        return d.toLocaleDateString("en-CA", { timeZone: tz });
      } catch {
        return d.toISOString().slice(0, 10);
      }
    };

    // Compute the Monday-based week-start key (YYYY-MM-DD) from a civil date
    // key in the user's timezone, so the result matches the client's
    // `startOfWeekMonday` (which works off local calendar dates, not UTC
    // instants). Doing this in UTC avoids server-TZ drift (e.g. a Monday
    // 00:00 UTC booking in a UTC-3 tz would otherwise map to the previous
    // Sunday when formatted in the user's tz).
    const weekStartKeyFromCivil = (civilKey: string): string => {
      const [y, m, d] = civilKey.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const dow = date.getUTCDay(); // 0=Sun..6=Sat
      const diff = dow === 0 ? -6 : 1 - dow;
      date.setUTCDate(date.getUTCDate() + diff);
      const yy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(date.getUTCDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    };

    const shiftWeekKey = (weekKey: string, deltaWeeks: number): string => {
      const [y, m, d] = weekKey.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() + deltaWeeks * 7);
      const yy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(date.getUTCDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    };

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
      const dateKey = toDateKey(b.class.startsAt);
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
      const civilKey = toDateKey(b.class.startsAt);
      attendedWeeks.add(weekStartKeyFromCivil(civilKey));
    }

    let weekStreak = 0;
    let checkWeekKey = weekStartKeyFromCivil(toDateKey(now));

    // Allow current week to not have a class yet
    if (!attendedWeeks.has(checkWeekKey)) {
      checkWeekKey = shiftWeekKey(checkWeekKey, -1);
    }

    while (attendedWeeks.has(checkWeekKey)) {
      weekStreak++;
      checkWeekKey = shiftWeekKey(checkWeekKey, -1);
    }

    // Which calendar weeks of this month had at least one class
    const weeksWithActivity: string[] = [];
    const seen = new Set<string>();
    for (const b of bookings) {
      const civilKey = toDateKey(b.class.startsAt);
      const key = weekStartKeyFromCivil(civilKey);
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
