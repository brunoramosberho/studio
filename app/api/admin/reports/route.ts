import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function startOf(date: Date, unit: "day" | "week" | "month"): Date {
  const d = new Date(date);
  if (unit === "day") {
    d.setHours(0, 0, 0, 0);
  } else if (unit === "week") {
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const now = new Date();
    const todayStart = startOf(now, "day");
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const weekStart = startOf(now, "week");
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const monthStart = startOf(now, "month");
    const prevMonthStart = new Date(monthStart);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const tomorrow = new Date(todayEnd);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as ("CONFIRMED" | "ATTENDED")[] };

    const [
      bookingsToday,
      bookingsPrevDay,
      bookingsThisWeek,
      bookingsPrevWeek,
      weeklyPurchases,
      prevWeekPurchases,
      newClientsThisWeek,
      newClientsPrevWeek,
      classesLast30d,
      prevMonthClasses,
      popularType,
      recentBookingsRaw,
      todayPurchases,
      monthPurchases,
      prevMonthPurchasesRaw,
      classesTodayCount,
      attendanceTodayCount,
      completedClassesMonth,
      activeUserIds,
    ] = await Promise.all([
      // Current KPIs
      prisma.booking.count({
        where: {
          createdAt: { gte: todayStart, lte: todayEnd },
          status: confirmedOrAttended,
          class: { tenantId },
        },
      }),
      prisma.booking.count({
        where: {
          createdAt: {
            gte: new Date(todayStart.getTime() - 86400000),
            lt: todayStart,
          },
          status: confirmedOrAttended,
          class: { tenantId },
        },
      }),
      prisma.booking.count({
        where: {
          createdAt: { gte: weekStart },
          status: confirmedOrAttended,
          class: { tenantId },
        },
      }),
      prisma.booking.count({
        where: {
          createdAt: { gte: prevWeekStart, lt: weekStart },
          status: confirmedOrAttended,
          class: { tenantId },
        },
      }),
      prisma.userPackage.findMany({
        where: { purchasedAt: { gte: weekStart }, tenantId },
        include: { package: { select: { price: true, name: true } } },
      }),
      prisma.userPackage.findMany({
        where: { purchasedAt: { gte: prevWeekStart, lt: weekStart }, tenantId },
        include: { package: { select: { price: true, name: true } } },
      }),
      prisma.membership.count({
        where: { createdAt: { gte: weekStart }, tenantId, role: "CLIENT" },
      }),
      prisma.membership.count({
        where: {
          createdAt: { gte: prevWeekStart, lt: weekStart },
          tenantId,
          role: "CLIENT",
        },
      }),
      prisma.class.findMany({
        where: {
          tenantId,
          startsAt: { gte: thirtyDaysAgo },
          status: { in: ["SCHEDULED", "COMPLETED"] },
        },
        include: {
          room: { select: { maxCapacity: true } },
          _count: {
            select: {
              bookings: { where: { status: confirmedOrAttended } },
            },
          },
        },
      }),
      prisma.class.findMany({
        where: {
          tenantId,
          startsAt: {
            gte: new Date(thirtyDaysAgo.getTime() - 30 * 86400000),
            lt: thirtyDaysAgo,
          },
          status: { in: ["SCHEDULED", "COMPLETED"] },
        },
        include: {
          room: { select: { maxCapacity: true } },
          _count: {
            select: {
              bookings: { where: { status: confirmedOrAttended } },
            },
          },
        },
      }),
      prisma.booking.groupBy({
        by: ["classId"],
        where: {
          createdAt: { gte: thirtyDaysAgo },
          status: confirmedOrAttended,
          class: { tenantId },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 1,
      }),

      // Recent bookings for dashboard list
      prisma.booking.findMany({
        where: {
          status: confirmedOrAttended,
          class: { tenantId },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          user: { select: { name: true } },
          class: {
            include: { classType: { select: { name: true } } },
          },
        },
      }),

      // Revenue today
      prisma.userPackage.findMany({
        where: {
          purchasedAt: { gte: todayStart, lte: todayEnd },
          tenantId,
        },
        include: { package: { select: { price: true, name: true } } },
      }),

      // Revenue this month
      prisma.userPackage.findMany({
        where: { purchasedAt: { gte: monthStart }, tenantId },
        include: { package: { select: { price: true, name: true } } },
      }),

      // Revenue prev month
      prisma.userPackage.findMany({
        where: {
          purchasedAt: { gte: prevMonthStart, lt: monthStart },
          tenantId,
        },
        include: { package: { select: { price: true, name: true } } },
      }),

      // Classes scheduled today
      prisma.class.count({
        where: {
          tenantId,
          startsAt: { gte: todayStart, lte: todayEnd },
          status: "SCHEDULED",
        },
      }),

      // Attendance today (ATTENDED bookings for today's classes)
      prisma.booking.count({
        where: {
          status: "ATTENDED",
          class: {
            tenantId,
            startsAt: { gte: todayStart, lte: todayEnd },
          },
        },
      }),

      // Completed classes this month
      prisma.class.count({
        where: {
          tenantId,
          startsAt: { gte: monthStart },
          status: "COMPLETED",
        },
      }),

      // Active members (distinct users with ATTENDED in last 30d)
      prisma.booking.findMany({
        where: {
          status: "ATTENDED",
          class: {
            tenantId,
            startsAt: { gte: thirtyDaysAgo },
          },
          userId: { not: null },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),

    ]);

    // Run queries with complex includes separately for type inference
    const [lowOccupancyRaw, expiringPkgs, birthdayUsers] =
      await Promise.all([
        prisma.class.findMany({
          where: {
            tenantId,
            startsAt: { gte: now, lte: tomorrow },
            status: "SCHEDULED",
          },
          include: {
            classType: { select: { name: true } },
            coach: { include: { user: { select: { name: true } } } },
            room: { select: { maxCapacity: true } },
            _count: {
              select: {
                bookings: {
                  where: { status: confirmedOrAttended },
                },
              },
            },
          },
        }),

        prisma.userPackage.findMany({
          where: {
            tenantId,
            expiresAt: { gte: now, lte: sevenDaysFromNow },
          },
          include: {
            user: { select: { id: true, name: true, image: true } },
            package: { select: { name: true } },
          },
          orderBy: { expiresAt: "asc" },
          take: 20,
        }),

        prisma.$queryRaw`
          SELECT u."id", u."name", u."image", u."birthday"
          FROM "User" u
          INNER JOIN "Membership" m ON m."userId" = u."id"
          WHERE m."tenantId" = ${tenantId}
            AND m."role" = 'CLIENT'
            AND u."birthday" IS NOT NULL
            AND EXTRACT(MONTH FROM u."birthday") = EXTRACT(MONTH FROM NOW())
            AND EXTRACT(DAY FROM u."birthday") BETWEEN
              EXTRACT(DAY FROM DATE_TRUNC('week', NOW()))
              AND EXTRACT(DAY FROM DATE_TRUNC('week', NOW()) + INTERVAL '6 days')
          LIMIT 20
        `,
      ]);

    // -- Compute derived values --

    const revenueThisWeek = weeklyPurchases.reduce(
      (s, p) => s + p.package.price,
      0,
    );
    const revenuePrevWeek = prevWeekPurchases.reduce(
      (s, p) => s + p.package.price,
      0,
    );

    const computeOccupancy = (
      classes: typeof classesLast30d,
    ): number => {
      if (classes.length === 0) return 0;
      const total = classes.reduce((sum, c) => {
        const cap = c.room.maxCapacity;
        if (cap === 0) return sum;
        return sum + c._count.bookings / cap;
      }, 0);
      return Math.round((total / classes.length) * 100);
    };

    const avgOccupancy = computeOccupancy(classesLast30d);
    const prevOccupancy = computeOccupancy(prevMonthClasses);

    let popularClassType = "N/A";
    if (popularType.length > 0) {
      const topClass = await prisma.class.findFirst({
        where: { id: popularType[0].classId },
        include: { classType: { select: { name: true } } },
      });
      popularClassType = topClass?.classType.name ?? "N/A";
    }

    // Revenue chart (last 7 days)
    const revenueChart: { name: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayRevenue = weeklyPurchases
        .concat(todayPurchases)
        .filter((p) => {
          const t = new Date(p.purchasedAt).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        })
        .reduce((s, p) => s + p.package.price, 0);

      revenueChart.push({
        name: DAY_NAMES[dayStart.getDay()],
        revenue: dayRevenue,
      });
    }

    // Recent bookings
    const recentBookings = recentBookingsRaw.map((b) => ({
      id: b.id,
      userName: b.user?.name ?? b.guestName ?? "Invitado",
      className: b.class.classType.name,
      createdAt: b.createdAt.toISOString(),
    }));

    // Monthly metrics
    const revenueToday = todayPurchases.reduce(
      (s, p) => s + p.package.price,
      0,
    );
    const revenueThisMonth = monthPurchases.reduce(
      (s, p) => s + p.package.price,
      0,
    );
    const revenuePrevMonth = prevMonthPurchasesRaw.reduce(
      (s, p) => s + p.package.price,
      0,
    );
    const activeMembersCount = activeUserIds.length;

    // Alerts
    const lowOccupancyClasses = lowOccupancyRaw
      .map((c) => {
        const cap = c.room.maxCapacity;
        const pct = cap > 0 ? Math.round((c._count.bookings / cap) * 100) : 0;
        return {
          id: c.id,
          name: c.classType.name,
          startsAt: c.startsAt.toISOString(),
          occupancyPct: pct,
          enrolled: c._count.bookings,
          capacity: cap,
          coachName: c.coach?.user.name ?? null,
        };
      })
      .filter((c) => c.occupancyPct < 30);

    const expiringPackages = expiringPkgs.map((p) => ({
      userId: p.user.id,
      userName: p.user.name,
      userImage: p.user.image,
      packageName: p.package.name,
      expiresAt: p.expiresAt.toISOString(),
    }));

    const birthdaysThisWeek = (
      birthdayUsers as {
        id: string;
        name: string | null;
        image: string | null;
        birthday: Date;
      }[]
    ).map((u) => ({
      id: u.id,
      name: u.name,
      image: u.image,
      birthday: u.birthday.toISOString(),
    }));

    const revenueBreakdown = Object.entries(
      (monthPurchases as { package: { name: string; price: number } }[]).reduce(
        (acc, p) => {
          const key = p.package.name;
          acc[key] = (acc[key] ?? 0) + (p.package.price ?? 0);
          return acc;
        },
        {} as Record<string, number>,
      ),
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const occupancyByDay = Array.from({ length: 7 }, (_, i) => {
      const dayClasses = (classesLast30d as { startsAt: Date; room?: { maxCapacity?: number | null } | null; _count?: { bookings?: number } }[])
        .filter((c) => new Date(c.startsAt).getDay() === i);
      const totals = dayClasses.reduce(
        (acc, c) => {
          const cap = c.room?.maxCapacity ?? 0;
          const enrolled = c._count?.bookings ?? 0;
          acc.capacity += cap;
          acc.enrolled += enrolled;
          return acc;
        },
        { capacity: 0, enrolled: 0 },
      );
      const pct = totals.capacity > 0 ? Math.round((totals.enrolled / totals.capacity) * 100) : 0;
      return { day: DAY_NAMES[i], occupancyPct: pct };
    });

    return NextResponse.json({
      // Existing KPIs
      bookingsToday,
      bookingsThisWeek,
      revenueThisWeek,
      avgOccupancy,
      newClientsThisWeek,
      popularClassType,

      // Trend percentages (vs previous period)
      bookingsTodayChange: pctChange(bookingsToday, bookingsPrevDay),
      revenueWeekChange: pctChange(revenueThisWeek, revenuePrevWeek),
      occupancyChange: pctChange(avgOccupancy, prevOccupancy),
      newClientsChange: pctChange(newClientsThisWeek, newClientsPrevWeek),

      // Chart + list
      revenueChart,
      recentBookings,

      // Daily metrics
      classesToday: classesTodayCount,
      attendanceToday: attendanceTodayCount,
      revenueToday,

      // Monthly metrics
      revenueThisMonth,
      revenuePrevMonth,
      revenueMonthChange: pctChange(revenueThisMonth, revenuePrevMonth),
      completedClassesMonth: completedClassesMonth,
      activeMembersCount,

      // Tremor dashboard breakdowns
      revenueBreakdown,
      occupancyByDay,

      // Alerts
      lowOccupancyClasses,
      expiringPackages,

      // Birthdays
      birthdaysThisWeek,
    });
  } catch (error) {
    console.error("GET /api/admin/reports error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 },
    );
  }
}
