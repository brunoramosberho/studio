import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { getPlatformSettlementForRange } from "@/lib/platforms/settlement";

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Weekday + time in the studio's timezone (so it reads right regardless of
// where the admin is viewing from), e.g. "Vie 8:00".
function formatClassWhen(date: Date, timezone: string | null): string {
  const tzOpts = timezone ? { timeZone: timezone } : {};
  const dayRaw = date
    .toLocaleDateString("es-ES", { weekday: "short", ...tzOpts })
    .replace(".", "");
  const day = dayRaw.charAt(0).toUpperCase() + dayRaw.slice(1);
  const time = date.toLocaleTimeString("es-ES", {
    hour: "numeric",
    minute: "2-digit",
    ...tzOpts,
  });
  return `${day} ${time}`;
}

function startOf(date: Date, unit: "day" | "week" | "month"): Date {
  const d = new Date(date);
  if (unit === "day") {
    d.setHours(0, 0, 0, 0);
  } else if (unit === "week") {
    // Monday-first week (ES/EU convention) so the dashboard week card runs
    // Mon→Sun and includes Sunday's classes — the heatmap is drawn Mon→Sun, and
    // a Sunday-first range ended on Saturday, dropping the upcoming Sunday.
    const dow = d.getDay(); // 0=Sun..6=Sat
    const diff = dow === 0 ? 6 : dow - 1; // days since Monday
    d.setDate(d.getDate() - diff);
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
    const ctx = await requirePermission("dashboard", "reports");
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

    // A UserPackage only counts toward dashboard revenue when money actually
    // changed hands. Exclude gifts, 100%-off comps, sandbox sims, not-yet-paid
    // placeholders, and packs with no payment reference — their synthetic
    // `stripePaymentId` never maps to a real charge. This keeps the dashboard
    // revenue aligned with /admin/finance (real Stripe `pi_*` + POS), instead
    // of summing catalog list price for free/gifted packs.
    const revenuePackageWhere = {
      status: "ACTIVE" as const,
      NOT: [
        { stripePaymentId: { startsWith: "gift_" } },
        { stripePaymentId: { startsWith: "discount_free_" } },
        { stripePaymentId: { startsWith: "sim_" } },
        { stripePaymentId: "pending_stripe" },
        { stripePaymentId: null },
      ],
    };

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
        where: { purchasedAt: { gte: weekStart }, tenantId, ...revenuePackageWhere },
        include: { package: { select: { price: true } } },
      }),
      prisma.userPackage.findMany({
        where: {
          purchasedAt: { gte: prevWeekStart, lt: weekStart },
          tenantId,
          ...revenuePackageWhere,
        },
        include: { package: { select: { price: true } } },
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
          user: { select: { id: true, name: true, image: true } },
          class: {
            include: {
              classType: { select: { name: true } },
              coach: { select: { name: true } },
              room: { include: { studio: { include: { city: { select: { timezone: true } } } } } },
            },
          },
          platformBooking: { select: { platform: true } },
        },
      }),

      // Revenue today. Status filter excludes PENDING_PAYMENT / PAYMENT_FAILED
      // / REVOKED / DISPUTED so abandoned checkouts and refunded purchases
      // don't inflate the dashboard total. (Not the canonical ASC 606 number —
      // that's RevenueEvent — but a meaningful gross-sales figure.)
      prisma.userPackage.findMany({
        where: {
          purchasedAt: { gte: todayStart, lte: todayEnd },
          tenantId,
          ...revenuePackageWhere,
        },
        include: { package: { select: { price: true } } },
      }),

      // Revenue this month
      prisma.userPackage.findMany({
        where: { purchasedAt: { gte: monthStart }, tenantId, ...revenuePackageWhere },
        include: { package: { select: { price: true, type: true } } },
      }),

      // Revenue prev month
      prisma.userPackage.findMany({
        where: {
          purchasedAt: { gte: prevMonthStart, lt: monthStart },
          tenantId,
          ...revenuePackageWhere,
        },
        include: { package: { select: { price: true } } },
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

    // ── Phase 2: data for the new visual hero widgets ──

    const sevenDaysAhead = new Date(weekStart);
    sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);

    const [todayClassesRaw, weekClassesRaw, lifecycleGroups, monthSubsPayments] =
      await Promise.all([
        // Today's timeline
        prisma.class.findMany({
          where: {
            tenantId,
            startsAt: { gte: todayStart, lte: todayEnd },
            status: { in: ["SCHEDULED", "COMPLETED"] },
          },
          include: {
            classType: { select: { name: true } },
            coach: { select: { name: true, user: { select: { name: true } } } },
            room: { select: { maxCapacity: true } },
            _count: {
              select: {
                bookings: { where: { status: confirmedOrAttended } },
              },
            },
          },
          orderBy: { startsAt: "asc" },
        }),
        // This week's classes (for heatmap)
        prisma.class.findMany({
          where: {
            tenantId,
            startsAt: { gte: weekStart, lt: sevenDaysAhead },
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
        // Lifecycle funnel
        prisma.membership.groupBy({
          by: ["lifecycleStage"],
          where: { tenantId, role: "CLIENT" },
          _count: true,
        }),
        // Active subscriptions count
        prisma.memberSubscription.count({
          where: { tenantId, status: "active" },
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
      userId: b.user?.id ?? null,
      userName: b.user?.name ?? b.guestName ?? "Invitado",
      userImage: b.user?.image ?? null,
      className: b.class.classType.name,
      coachName: b.class.coach?.name ?? null,
      classTimeLabel: formatClassWhen(
        b.class.startsAt,
        b.class.room?.studio?.city?.timezone ?? null,
      ),
      platform: b.platformBooking?.platform ?? null,
      createdAt: b.createdAt.toISOString(),
    }));

    // Monthly metrics
    const revenueToday = todayPurchases.reduce(
      (s, p) => s + p.package.price,
      0,
    );
    // Estimated Wellhub (and other partner) settlement, folded into the
    // month-to-date revenue so the dashboard reflects partner income alongside
    // package sales. This-month is MTD; previous month is the full month so the
    // comparison matches `revenuePrevMonth`. Display-only — never written to the
    // RevenueEvent ledger.
    const [wellhubThisMonth, wellhubPrevMonth] = await Promise.all([
      getPlatformSettlementForRange(tenantId, monthStart, now),
      getPlatformSettlementForRange(tenantId, prevMonthStart, monthStart),
    ]);
    const packageRevenueThisMonth = monthPurchases.reduce(
      (s, p) => s + p.package.price,
      0,
    );
    const revenueThisMonth = packageRevenueThisMonth + wellhubThisMonth.total;
    const revenuePrevMonth =
      prevMonthPurchasesRaw.reduce((s, p) => s + p.package.price, 0) +
      wellhubPrevMonth.total;
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
          coachName: c.coach?.name ?? null,
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
      // Wellhub (and other partner) portion of revenueThisMonth — surfaced so
      // the dashboard can label it as an estimate. 0 when no platform configured.
      wellhubRevenueThisMonth: wellhubThisMonth.total,
      wellhubCheckinsThisMonth: wellhubThisMonth.checkins,
      completedClassesMonth: completedClassesMonth,
      activeMembersCount,

      // Alerts
      lowOccupancyClasses,
      expiringPackages,

      // Birthdays
      birthdaysThisWeek,

      // ── Phase 2 visual hero data ──
      todayTimeline: todayClassesRaw.map((c) => {
        const cap = c.room.maxCapacity;
        const enrolled = c._count.bookings;
        const durMin = Math.max(
          1,
          Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / 60000),
        );
        return {
          id: c.id,
          name: c.classType.name,
          coachName: c.coach?.name ?? c.coach?.user?.name ?? null,
          startsAt: c.startsAt.toISOString(),
          durationMinutes: durMin,
          enrolled,
          capacity: cap,
          fillPct: cap > 0 ? Math.round((enrolled / cap) * 100) : 0,
          status: c.status,
        };
      }),
      weekHeatmap: weekClassesRaw.map((c) => {
        const cap = c.room.maxCapacity;
        const enrolled = c._count.bookings;
        return {
          id: c.id,
          startsAt: c.startsAt.toISOString(),
          dayOfWeek: c.startsAt.getDay(),
          hour: c.startsAt.getHours(),
          enrolled,
          capacity: cap,
          fillPct: cap > 0 ? Math.round((enrolled / cap) * 100) : 0,
        };
      }),
      lifecycle: {
        lead: lifecycleGroups.find((g) => g.lifecycleStage === "lead")?._count ?? 0,
        installed:
          lifecycleGroups.find((g) => g.lifecycleStage === "installed")?._count ?? 0,
        purchased:
          lifecycleGroups.find((g) => g.lifecycleStage === "purchased")?._count ?? 0,
        booked:
          lifecycleGroups.find((g) => g.lifecycleStage === "booked")?._count ?? 0,
        attended:
          lifecycleGroups.find((g) => g.lifecycleStage === "attended")?._count ?? 0,
        member:
          lifecycleGroups.find((g) => g.lifecycleStage === "member")?._count ?? 0,
      },
      revenueMix: (() => {
        const byType: Record<string, number> = {};
        for (const p of monthPurchases) {
          const t = p.package.type ?? "PACK";
          byType[t] = (byType[t] ?? 0) + p.package.price;
        }
        const slices = Object.entries(byType).map(([type, amount]) => ({
          type,
          amount,
        }));
        // Wellhub (and other partner) settlement, shown as its own slice so the
        // month-to-date total includes it. Labeled as an estimate in the UI.
        if (wellhubThisMonth.total > 0) {
          slices.push({ type: "WELLHUB", amount: wellhubThisMonth.total });
        }
        return slices;
      })(),
      activeSubscriptionsCount: monthSubsPayments,
    });
  } catch (error) {
    console.error("GET /api/admin/reports error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 },
    );
  }
}
