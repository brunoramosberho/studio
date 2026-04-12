import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import { getCoverageStatus, getSubstituteSuggestions, getZone } from "@/lib/availability";
import type { BookingStatus } from "@prisma/client";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
} from "date-fns";
import { es } from "date-fns/locale";

const CONFIRMED_OR_ATTENDED: BookingStatus[] = ["CONFIRMED", "ATTENDED"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, input: any, tenantId: string, adminUserId?: string): Promise<unknown> {
  switch (name) {
    case "get_studio_overview":
      return getStudioOverview(input, tenantId);
    case "get_class_stats":
      return getClassStats(input, tenantId);
    case "get_coach_performance":
      return getCoachPerformance(input, tenantId);
    case "get_retention_metrics":
      return getRetentionMetrics(input, tenantId);
    case "get_member_activity":
      return getMemberActivity(input, tenantId);
    case "get_waitlist_data":
      return getWaitlistData(input, tenantId);
    case "get_revenue_summary":
      return getRevenueSummary(input, tenantId);
    case "get_schedule":
      return getSchedule(input, tenantId);
    case "create_class":
      return createClass(input, tenantId);
    case "cancel_class":
      return cancelClass(input, tenantId);
    case "send_announcement":
      return sendAnnouncement(input, tenantId);
    case "create_studio":
      return createStudio(input, tenantId);
    case "create_room":
      return createRoom(input, tenantId);
    case "invite_coach":
      return inviteCoach(input, tenantId);
    case "create_client":
      return createClient(input, tenantId);
    case "create_class_type":
      return createClassType(input, tenantId);
    case "create_post":
      return createPost(input, tenantId, adminUserId);
    case "get_availability_coverage":
      return getAvailabilityCoverage(input, tenantId);
    case "get_availability_pending":
      return getAvailabilityPending(tenantId);
    case "get_substitute_suggestions":
      return getSubstituteSuggestionsAI(input, tenantId);
    case "review_availability_request":
      return reviewAvailabilityRequest(input, tenantId, adminUserId);
    case "get_packages_overview":
      return getPackagesOverview(input, tenantId);
    case "get_subscriptions_status":
      return getSubscriptionsStatus(input, tenantId);
    case "get_finance_summary":
      return getFinanceSummary(input, tenantId);
    case "get_checkin_stats":
      return getCheckinStats(input, tenantId);
    case "get_platform_status":
      return getPlatformStatus(input, tenantId);
    case "get_client_detail":
      return getClientDetail(input, tenantId);
    case "get_coach_detail":
      return getCoachDetail(input, tenantId);
    case "get_ratings_summary":
      return getRatingsSummary(input, tenantId);
    case "get_gamification_overview":
      return getGamificationOverview(input, tenantId);
    case "get_referral_metrics":
      return getReferralMetrics(input, tenantId);
    case "log_feature_request":
      return logFeatureRequest(input, tenantId, adminUserId);
    case "propose_weekly_schedule":
      return proposeWeeklySchedule(input, tenantId);
    case "create_class_batch":
      return createClassBatch(input, tenantId);
    case "update_class":
      return updateClass(input, tenantId);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function periodToDays(period: string): number {
  switch (period) {
    case "week": return 7;
    case "month": return 30;
    case "quarter": return 90;
    case "year": return 365;
    default: return 30;
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── READ TOOLS ─────────────────────────────────────────────

async function getStudioOverview(
  input: { period: string },
  tenantId: string,
) {
  const days = periodToDays(input.period);
  const since = daysAgo(days);
  const prevSince = daysAgo(days * 2);
  const confirmedOrAttended = { in: CONFIRMED_OR_ATTENDED };

  const [
    classes,
    prevClasses,
    activeMembers,
    prevActiveMembers,
    purchases,
    prevPurchases,
    totalMembers,
    classesThisWeek,
  ] = await Promise.all([
    prisma.class.findMany({
      where: { tenantId, startsAt: { gte: since }, status: { not: "CANCELLED" } },
      include: {
        room: { select: { maxCapacity: true } },
        _count: { select: { bookings: { where: { status: confirmedOrAttended } } } },
      },
    }),
    prisma.class.findMany({
      where: { tenantId, startsAt: { gte: prevSince, lt: since }, status: { not: "CANCELLED" } },
      include: {
        room: { select: { maxCapacity: true } },
        _count: { select: { bookings: { where: { status: confirmedOrAttended } } } },
      },
    }),
    prisma.booking.findMany({
      where: { class: { tenantId }, createdAt: { gte: since }, status: confirmedOrAttended },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.booking.findMany({
      where: { class: { tenantId }, createdAt: { gte: prevSince, lt: since }, status: confirmedOrAttended },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.userPackage.findMany({
      where: { tenantId, purchasedAt: { gte: since } },
      include: { package: { select: { price: true } } },
    }),
    prisma.userPackage.findMany({
      where: { tenantId, purchasedAt: { gte: prevSince, lt: since } },
      include: { package: { select: { price: true } } },
    }),
    prisma.membership.count({ where: { tenantId, role: "CLIENT" } }),
    prisma.class.count({
      where: { tenantId, startsAt: { gte: daysAgo(7) }, status: { not: "CANCELLED" } },
    }),
  ]);

  const fillRate = (list: typeof classes) => {
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, c) => {
      const cap = c.room.maxCapacity;
      return cap > 0 ? acc + c._count.bookings / cap : acc;
    }, 0);
    return Math.round((sum / list.length) * 100);
  };

  const revenue = purchases.reduce((s, p) => s + p.package.price, 0);
  const prevRevenue = prevPurchases.reduce((s, p) => s + p.package.price, 0);

  return {
    period: input.period,
    total_classes: classes.length,
    prev_total_classes: prevClasses.length,
    avg_fill_rate_pct: fillRate(classes),
    prev_avg_fill_rate_pct: fillRate(prevClasses),
    total_bookings: classes.reduce((s, c) => s + c._count.bookings, 0),
    active_members: activeMembers.length,
    prev_active_members: prevActiveMembers.length,
    total_members: totalMembers,
    revenue,
    prev_revenue: prevRevenue,
    revenue_change_pct: prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null,
    classes_this_week: classesThisWeek,
  };
}

async function getClassStats(
  input: { period_days: number; group_by: string; coach_id?: string },
  tenantId: string,
) {
  const since = daysAgo(input.period_days);
  const confirmedOrAttended = { in: CONFIRMED_OR_ATTENDED };

  const where: Record<string, unknown> = {
    tenantId,
    startsAt: { gte: since },
  };
  if (input.coach_id) where.coachId = input.coach_id;

  const classes = await prisma.class.findMany({
    where,
    include: {
      classType: { select: { name: true } },
      coach: { select: { id: true, name: true, user: { select: { name: true } } } },
      room: { select: { maxCapacity: true } },
      _count: {
        select: {
          bookings: { where: { status: confirmedOrAttended } },
          waitlist: true,
        },
      },
    },
  });

  const groups = new Map<string, {
    key: string;
    class_count: number;
    total_bookings: number;
    total_capacity: number;
    cancellations: number;
    total_waitlist: number;
  }>();

  for (const c of classes) {
    let key: string;
    switch (input.group_by) {
      case "class_type":
        key = c.classType.name;
        break;
      case "coach":
        key = c.coach.name ?? c.coach.id;
        break;
      case "day_of_week": {
        const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        key = dayNames[c.startsAt.getDay()];
        break;
      }
      case "time_slot":
        key = c.startsAt.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false });
        break;
      default:
        key = "all";
    }

    const existing = groups.get(key) ?? {
      key,
      class_count: 0,
      total_bookings: 0,
      total_capacity: 0,
      cancellations: 0,
      total_waitlist: 0,
    };
    existing.class_count++;
    existing.total_bookings += c._count.bookings;
    existing.total_capacity += c.room.maxCapacity;
    if (c.status === "CANCELLED") existing.cancellations++;
    existing.total_waitlist += c._count.waitlist;
    groups.set(key, existing);
  }

  const results = Array.from(groups.values())
    .map((g) => ({
      ...g,
      avg_fill_rate_pct:
        g.total_capacity > 0
          ? Math.round((g.total_bookings / g.total_capacity) * 100)
          : 0,
    }))
    .sort((a, b) => b.avg_fill_rate_pct - a.avg_fill_rate_pct);

  return { group_by: input.group_by, period_days: input.period_days, stats: results };
}

async function getCoachPerformance(
  input: { period_days: number; coach_id?: string },
  tenantId: string,
) {
  const since = daysAgo(input.period_days);
  const confirmedOrAttended = { in: CONFIRMED_OR_ATTENDED };

  const where: Record<string, unknown> = { tenantId };
  if (input.coach_id) where.id = input.coach_id;

  const coaches = await prisma.coachProfile.findMany({
    where,
    include: {
      user: { select: { name: true, image: true } },
      classes: {
        where: { startsAt: { gte: since } },
        include: {
          room: { select: { maxCapacity: true } },
          _count: {
            select: { bookings: { where: { status: confirmedOrAttended } } },
          },
        },
      },
    },
  });

  return coaches.map((coach) => {
    const totalClasses = coach.classes.length;
    const cancelled = coach.classes.filter((c) => c.status === "CANCELLED").length;
    const active = coach.classes.filter((c) => c.status !== "CANCELLED");
    const totalBookings = active.reduce((s, c) => s + c._count.bookings, 0);
    const totalCapacity = active.reduce((s, c) => s + c.room.maxCapacity, 0);
    const fillRate = totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0;

    return {
      coach_id: coach.id,
      name: coach.name,
      total_classes: totalClasses,
      cancelled_classes: cancelled,
      total_bookings: totalBookings,
      avg_fill_rate_pct: fillRate,
      specialties: coach.specialties,
    };
  });
}

async function getRetentionMetrics(
  input: { at_risk_days: number; include_cohorts?: boolean },
  tenantId: string,
) {
  const confirmedOrAttended = { in: CONFIRMED_OR_ATTENDED };
  const atRiskDate = daysAgo(input.at_risk_days);

  const memberships = await prisma.membership.findMany({
    where: { tenantId, role: "CLIENT" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          bookings: {
            where: { class: { tenantId }, status: confirmedOrAttended },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });

  const atRisk: { id: string; name: string | null; email: string; last_booking: string | null; days_since: number | null }[] = [];
  const now = Date.now();

  for (const m of memberships) {
    const lastBooking = m.user.bookings[0]?.createdAt;
    if (!lastBooking || lastBooking < atRiskDate) {
      const daysSince = lastBooking
        ? Math.floor((now - lastBooking.getTime()) / 86400000)
        : null;
      atRisk.push({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        last_booking: lastBooking?.toISOString() ?? null,
        days_since: daysSince,
      });
    }
  }

  atRisk.sort((a, b) => (b.days_since ?? 9999) - (a.days_since ?? 9999));

  const result: Record<string, unknown> = {
    total_members: memberships.length,
    at_risk_count: atRisk.length,
    at_risk_pct: memberships.length > 0 ? Math.round((atRisk.length / memberships.length) * 100) : 0,
    at_risk_members: atRisk.slice(0, 20),
  };

  if (input.include_cohorts) {
    const cohorts = new Map<string, { joined: number; still_active: number }>();
    for (const m of memberships) {
      const month = m.createdAt.toISOString().slice(0, 7);
      const existing = cohorts.get(month) ?? { joined: 0, still_active: 0 };
      existing.joined++;
      const lastBooking = m.user.bookings[0]?.createdAt;
      if (lastBooking && lastBooking >= atRiskDate) {
        existing.still_active++;
      }
      cohorts.set(month, existing);
    }
    result.cohorts = Array.from(cohorts.entries())
      .map(([month, data]) => ({
        month,
        ...data,
        retention_pct: data.joined > 0 ? Math.round((data.still_active / data.joined) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  return result;
}

async function getMemberActivity(
  input: { member_id?: string; member_name?: string; segment?: string; period_days: number },
  tenantId: string,
) {
  const since = daysAgo(input.period_days);
  const confirmedOrAttended = { in: CONFIRMED_OR_ATTENDED };

  if (input.member_id || input.member_name) {
    const userWhere: Record<string, unknown> = {};
    if (input.member_id) {
      userWhere.id = input.member_id;
    } else if (input.member_name) {
      userWhere.name = { contains: input.member_name, mode: "insensitive" };
    }

    const users = await prisma.user.findMany({
      where: {
        ...userWhere,
        memberships: { some: { tenantId, role: "CLIENT" } },
      },
      take: 5,
      include: {
        bookings: {
          where: { class: { tenantId }, status: confirmedOrAttended, createdAt: { gte: since } },
          include: {
            class: {
              include: {
                classType: { select: { name: true } },
                coach: { select: { name: true, user: { select: { name: true } } } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        packages: {
          where: { tenantId, expiresAt: { gte: new Date() } },
          include: { package: { select: { name: true, credits: true } } },
          orderBy: { expiresAt: "asc" },
        },
      },
    });

    return users.map((u) => {
      const classTypes = new Map<string, number>();
      const coaches = new Map<string, number>();
      for (const b of u.bookings) {
        const ct = b.class.classType.name;
        classTypes.set(ct, (classTypes.get(ct) ?? 0) + 1);
        const coach = b.class.coach.name ?? "Desconocido";
        coaches.set(coach, (coaches.get(coach) ?? 0) + 1);
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        total_bookings: u.bookings.length,
        weekly_avg: input.period_days > 0 ? Math.round((u.bookings.length / (input.period_days / 7)) * 10) / 10 : 0,
        last_visit: u.bookings[0]?.createdAt.toISOString() ?? null,
        favorite_class_types: Array.from(classTypes.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, count]) => ({ name, count })),
        favorite_coaches: Array.from(coaches.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, count]) => ({ name, count })),
        active_packages: u.packages.map((p) => ({
          name: p.package.name,
          credits_remaining: p.creditsTotal ? p.creditsTotal - p.creditsUsed : "unlimited",
          expires_at: p.expiresAt.toISOString(),
        })),
      };
    });
  }

  // Segment-based query
  const memberFilter: Record<string, unknown> = { tenantId, role: "CLIENT" };
  const memberships = await prisma.membership.findMany({
    where: memberFilter,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          bookings: {
            where: { class: { tenantId }, status: confirmedOrAttended, createdAt: { gte: since } },
            select: { createdAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  let filtered = memberships;
  const atRiskDate = daysAgo(14);

  switch (input.segment) {
    case "at_risk":
      filtered = memberships.filter((m) => {
        const last = m.user.bookings[0]?.createdAt;
        return !last || last < atRiskDate;
      });
      break;
    case "vip":
      filtered = memberships.filter((m) => m.user.bookings.length >= 8);
      break;
    case "new":
      filtered = memberships.filter(
        (m) => m.createdAt >= daysAgo(30),
      );
      break;
  }

  return {
    segment: input.segment ?? "all",
    count: filtered.length,
    members: filtered.slice(0, 20).map((m) => ({
      id: m.user.id,
      name: m.user.name,
      bookings_in_period: m.user.bookings.length,
      joined: m.createdAt.toISOString(),
      last_booking: m.user.bookings[0]?.createdAt.toISOString() ?? null,
    })),
  };
}

async function getWaitlistData(
  input: { period_days: number; min_waitlist_count?: number },
  tenantId: string,
) {
  const since = daysAgo(input.period_days);
  const minCount = input.min_waitlist_count ?? 1;

  const classes = await prisma.class.findMany({
    where: {
      tenantId,
      startsAt: { gte: since },
      waitlist: { some: {} },
    },
    include: {
      classType: { select: { name: true } },
      coach: { select: { name: true, user: { select: { name: true } } } },
      room: { select: { maxCapacity: true, name: true } },
      _count: { select: { waitlist: true, bookings: { where: { status: "CONFIRMED" } } } },
    },
    orderBy: { startsAt: "desc" },
  });

  const filtered = classes
    .filter((c) => c._count.waitlist >= minCount)
    .map((c) => ({
      class_id: c.id,
      class_type: c.classType.name,
      coach: c.coach.name,
      starts_at: c.startsAt.toISOString(),
      room: c.room.name,
      capacity: c.room.maxCapacity,
      booked: c._count.bookings,
      waitlist_count: c._count.waitlist,
    }));

  return {
    period_days: input.period_days,
    classes_with_waitlist: filtered.length,
    data: filtered,
  };
}

async function getRevenueSummary(
  input: { period: string; breakdown_by?: string },
  tenantId: string,
) {
  const days = periodToDays(input.period);
  const since = daysAgo(days);
  const prevSince = daysAgo(days * 2);

  const [current, previous] = await Promise.all([
    prisma.userPackage.findMany({
      where: { tenantId, purchasedAt: { gte: since } },
      include: {
        package: { select: { name: true, price: true, type: true, credits: true } },
      },
      orderBy: { purchasedAt: "desc" },
    }),
    prisma.userPackage.findMany({
      where: { tenantId, purchasedAt: { gte: prevSince, lt: since } },
      include: { package: { select: { price: true } } },
    }),
  ]);

  const totalRevenue = current.reduce((s, p) => s + p.package.price, 0);
  const prevRevenue = previous.reduce((s, p) => s + p.package.price, 0);

  const result: Record<string, unknown> = {
    period: input.period,
    total_revenue: totalRevenue,
    prev_period_revenue: prevRevenue,
    change_pct: prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100) : null,
    total_purchases: current.length,
  };

  if (input.breakdown_by === "membership_type") {
    const byType = new Map<string, { count: number; revenue: number; type: string }>();
    for (const p of current) {
      const key = p.package.name;
      const existing = byType.get(key) ?? { count: 0, revenue: 0, type: p.package.type };
      existing.count++;
      existing.revenue += p.package.price;
      byType.set(key, existing);
    }
    result.breakdown = Array.from(byType.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  } else if (input.breakdown_by === "day" || input.breakdown_by === "week") {
    const byPeriod = new Map<string, number>();
    for (const p of current) {
      const d = p.purchasedAt;
      const key =
        input.breakdown_by === "day"
          ? d.toISOString().slice(0, 10)
          : `${d.getFullYear()}-W${String(Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)).padStart(2, "0")}`;
      byPeriod.set(key, (byPeriod.get(key) ?? 0) + p.package.price);
    }
    result.breakdown = Array.from(byPeriod.entries())
      .map(([period, revenue]) => ({ period, revenue }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  return result;
}

async function getSchedule(
  input: { days_ahead: number; include_past_days?: number },
  tenantId: string,
) {
  const now = new Date();
  const from = input.include_past_days ? daysAgo(input.include_past_days) : now;
  const to = new Date();
  to.setDate(to.getDate() + input.days_ahead);
  to.setHours(23, 59, 59, 999);

  const classes = await prisma.class.findMany({
    where: {
      tenantId,
      startsAt: { gte: from, lte: to },
    },
    include: {
      classType: { select: { name: true, duration: true, level: true } },
      coach: { select: { name: true, user: { select: { name: true } } } },
      room: { select: { name: true, maxCapacity: true, studio: { select: { name: true } } } },
      _count: {
        select: {
          bookings: { where: { status: { in: CONFIRMED_OR_ATTENDED } } },
          waitlist: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  return classes.map((c) => ({
    id: c.id,
    class_type: c.classType.name,
    level: c.classType.level,
    coach: c.coach.name,
    studio: c.room.studio.name,
    room: c.room.name,
    starts_at: c.startsAt.toISOString(),
    ends_at: c.endsAt.toISOString(),
    status: c.status,
    capacity: c.room.maxCapacity,
    booked: c._count.bookings,
    waitlist: c._count.waitlist,
    fill_rate_pct: c.room.maxCapacity > 0
      ? Math.round((c._count.bookings / c.room.maxCapacity) * 100)
      : 0,
  }));
}

// ─── WRITE TOOLS ────────────────────────────────────────────

async function createClass(
  input: {
    class_type_id: string;
    coach_id: string;
    room_id: string;
    starts_at: string;
    ends_at: string;
    is_recurring?: boolean;
    recurring_id?: string;
  },
  tenantId: string,
) {
  const newClass = await prisma.class.create({
    data: {
      tenantId,
      classTypeId: input.class_type_id,
      coachId: input.coach_id,
      roomId: input.room_id,
      startsAt: new Date(input.starts_at),
      endsAt: new Date(input.ends_at),
      isRecurring: input.is_recurring ?? false,
      recurringId: input.recurring_id,
    },
    include: {
      classType: { select: { name: true } },
      coach: { select: { name: true, user: { select: { name: true } } } },
      room: { select: { name: true, studio: { select: { name: true } } } },
    },
  });

  return {
    success: true,
    class_id: newClass.id,
    summary: `Clase "${newClass.classType.name}" creada para ${newClass.startsAt.toLocaleDateString("es")} con ${newClass.coach.name} en ${newClass.room.studio.name} - ${newClass.room.name}`,
  };
}

async function createClassBatch(
  input: {
    classes: {
      class_type_id: string;
      coach_id: string;
      room_id: string;
      starts_at: string;
      ends_at: string;
    }[];
  },
  tenantId: string,
) {
  if (!input.classes || input.classes.length === 0) {
    return { error: "No se proporcionaron clases para crear" };
  }

  if (input.classes.length > 50) {
    return { error: "Máximo 50 clases por batch" };
  }

  const recurringId = crypto.randomUUID();
  const results: { success: boolean; summary: string }[] = [];

  for (const cls of input.classes) {
    try {
      const newClass = await prisma.class.create({
        data: {
          tenantId,
          classTypeId: cls.class_type_id,
          coachId: cls.coach_id,
          roomId: cls.room_id,
          startsAt: new Date(cls.starts_at),
          endsAt: new Date(cls.ends_at),
          isRecurring: true,
          recurringId,
        },
        include: {
          classType: { select: { name: true } },
          coach: { select: { name: true, user: { select: { name: true } } } },
          room: { select: { name: true, studio: { select: { name: true } } } },
        },
      });
      results.push({
        success: true,
        summary: `${newClass.classType.name} — ${format(newClass.startsAt, "EEEE d MMM HH:mm", { locale: es })} con ${newClass.coach.name} en ${newClass.room.name}`,
      });
    } catch (err) {
      results.push({
        success: false,
        summary: `Error creando clase ${cls.starts_at}: ${err instanceof Error ? err.message : "Error desconocido"}`,
      });
    }
  }

  const created = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    success: failed === 0,
    recurring_id: recurringId,
    total: input.classes.length,
    created,
    failed,
    classes: results,
    summary: `${created} clases creadas${failed > 0 ? `, ${failed} fallaron` : ""}. ID de recurrencia: ${recurringId}`,
  };
}

async function updateClass(
  input: {
    class_id: string;
    starts_at?: string;
    ends_at?: string;
    coach_id?: string;
    room_id?: string;
  },
  tenantId: string,
) {
  const cls = await prisma.class.findFirst({
    where: { id: input.class_id, tenantId },
    include: {
      classType: { select: { name: true } },
      coach: { select: { name: true, user: { select: { name: true } } } },
      room: { select: { name: true, studio: { select: { name: true } } } },
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
    },
  });

  if (!cls) return { error: "Clase no encontrada" };

  const updateData: Record<string, unknown> = {};
  const changes: string[] = [];

  if (input.starts_at) {
    updateData.startsAt = new Date(input.starts_at);
    changes.push(`horario inicio → ${format(new Date(input.starts_at), "EEEE d MMM HH:mm", { locale: es })}`);
  }
  if (input.ends_at) {
    updateData.endsAt = new Date(input.ends_at);
    changes.push(`horario fin → ${format(new Date(input.ends_at), "HH:mm", { locale: es })}`);
  }
  if (input.coach_id) {
    updateData.coachId = input.coach_id;
    const newCoach = await prisma.coachProfile.findUnique({
      where: { id: input.coach_id },
      select: { name: true },
    });
    changes.push(`coach → ${newCoach?.name || input.coach_id}`);
  }
  if (input.room_id) {
    updateData.roomId = input.room_id;
    const newRoom = await prisma.room.findUnique({
      where: { id: input.room_id },
      select: { name: true },
    });
    changes.push(`sala → ${newRoom?.name || input.room_id}`);
  }

  if (Object.keys(updateData).length === 0) {
    return { error: "No se proporcionaron cambios" };
  }

  await prisma.class.update({
    where: { id: input.class_id },
    data: updateData,
  });

  return {
    success: true,
    class_id: input.class_id,
    class_name: cls.classType.name,
    booked_members: cls._count.bookings,
    changes,
    summary: `Clase "${cls.classType.name}" actualizada: ${changes.join(", ")}. ${cls._count.bookings > 0 ? `⚠ ${cls._count.bookings} miembros inscritos.` : "Sin miembros inscritos."}`,
  };
}

async function logFeatureRequest(
  input: { request: string; category: string; spark_note: string },
  tenantId: string,
  adminUserId?: string,
) {
  try {
    const [tenant, admin] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      adminUserId
        ? prisma.user.findUnique({ where: { id: adminUserId }, select: { name: true } })
        : null,
    ]);

    await prisma.sparkFeatureRequest.create({
      data: {
        tenantId,
        adminUserId: adminUserId || "unknown",
        request: input.request,
        category: input.category,
        sparkNote: input.spark_note,
        adminName: admin?.name || null,
        studioName: tenant?.name || null,
      },
    });

    return { logged: true };
  } catch {
    return { logged: false };
  }
}

async function proposeWeeklySchedule(
  input: { week_start?: string; preferences?: string },
  tenantId: string,
) {
  // Determine the target week
  const now = new Date();
  let weekStart: Date;
  if (input.week_start) {
    weekStart = new Date(input.week_start);
  } else {
    // Next Monday
    const dayOfWeek = now.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() + daysUntilMonday);
  }
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Get historical data: last 4 weeks of classes with fill rates
  const historySince = daysAgo(28);
  const [historicalClasses, classTypes, coaches, rooms] = await Promise.all([
    prisma.class.findMany({
      where: {
        tenantId,
        startsAt: { gte: historySince },
        status: { not: "CANCELLED" },
      },
      include: {
        classType: { select: { id: true, name: true, duration: true } },
        coach: { select: { id: true, name: true, user: { select: { name: true } } } },
        room: { select: { id: true, name: true, maxCapacity: true, studio: { select: { name: true } } } },
        _count: {
          select: {
            bookings: { where: { status: { in: CONFIRMED_OR_ATTENDED } } },
            waitlist: true,
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.classType.findMany({ where: { tenantId }, select: { id: true, name: true, duration: true } }),
    prisma.coachProfile.findMany({
      where: { tenantId },
      select: { id: true, name: true, user: { select: { name: true } } },
    }),
    prisma.room.findMany({
      where: { studio: { tenantId } },
      include: { studio: { select: { name: true } } },
    }),
  ]);

  // Analyze fill rates by day of week + time slot + class type
  const slotPerformance = new Map<string, { total: number; fillRateSum: number; waitlistTotal: number; count: number }>();

  for (const c of historicalClasses) {
    const dayOfWeek = format(c.startsAt, "EEEE", { locale: es });
    const hour = format(c.startsAt, "HH:mm");
    const key = `${dayOfWeek}|${hour}|${c.classType.name}`;
    const existing = slotPerformance.get(key) ?? { total: 0, fillRateSum: 0, waitlistTotal: 0, count: 0 };
    const capacity = c.room.maxCapacity || 1;
    existing.fillRateSum += (c._count.bookings / capacity) * 100;
    existing.waitlistTotal += c._count.waitlist;
    existing.count++;
    slotPerformance.set(key, existing);
  }

  // Build top performing slots
  const topSlots = Array.from(slotPerformance.entries())
    .map(([key, data]) => {
      const [day, time, classType] = key.split("|");
      return {
        day,
        time,
        class_type: classType,
        avg_fill_rate: Math.round(data.fillRateSum / data.count),
        avg_waitlist: Math.round(data.waitlistTotal / data.count),
        sample_size: data.count,
      };
    })
    .sort((a, b) => b.avg_fill_rate - a.avg_fill_rate);

  // Analyze coach performance
  const coachStats = new Map<string, { name: string; classes: number; avgFillRate: number; classTypes: Set<string> }>();
  for (const c of historicalClasses) {
    const coachId = c.coach.id;
    const existing = coachStats.get(coachId) ?? {
      name: c.coach.name ?? "Desconocido",
      classes: 0,
      avgFillRate: 0,
      classTypes: new Set<string>(),
    };
    const capacity = c.room.maxCapacity || 1;
    existing.avgFillRate = (existing.avgFillRate * existing.classes + (c._count.bookings / capacity) * 100) / (existing.classes + 1);
    existing.classes++;
    existing.classTypes.add(c.classType.name);
    coachStats.set(coachId, existing);
  }

  return {
    week: {
      start: format(weekStart, "yyyy-MM-dd"),
      end: format(weekEnd, "yyyy-MM-dd"),
      label: `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM yyyy", { locale: es })}`,
    },
    preferences: input.preferences || null,
    historical_analysis: {
      weeks_analyzed: 4,
      total_classes_analyzed: historicalClasses.length,
      top_performing_slots: topSlots.slice(0, 20),
      underperforming_slots: topSlots.filter((s) => s.avg_fill_rate < 40).slice(0, 10),
      high_demand_slots: topSlots.filter((s) => s.avg_waitlist > 0).slice(0, 10),
    },
    available_resources: {
      class_types: classTypes.map((ct) => ({ id: ct.id, name: ct.name, duration: ct.duration })),
      coaches: Array.from(coachStats.entries()).map(([id, stats]) => ({
        id,
        name: stats.name,
        avg_fill_rate: Math.round(stats.avgFillRate),
        class_count_last_4w: stats.classes,
        disciplines: Array.from(stats.classTypes),
      })),
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        studio: r.studio.name,
        capacity: r.maxCapacity,
      })),
    },
    instructions: "Con esta data, propón un horario semanal optimizado. Usa los IDs reales de class_type, coach y room. Presenta como tabla y después ofrece crear las clases con create_class_batch.",
  };
}

async function cancelClass(
  input: { class_id: string; reason: string },
  tenantId: string,
) {
  const cls = await prisma.class.findFirst({
    where: { id: input.class_id, tenantId },
    include: {
      classType: { select: { name: true } },
      bookings: {
        where: { status: "CONFIRMED" },
        select: { userId: true, user: { select: { name: true } } },
      },
    },
  });

  if (!cls) return { error: "Clase no encontrada" };

  await prisma.class.update({
    where: { id: input.class_id },
    data: { status: "CANCELLED" },
  });

  const notifiedCount = cls.bookings.filter((b) => b.userId).length;
  for (const booking of cls.bookings) {
    if (booking.userId) {
      sendPushToUser(booking.userId, {
        title: "Clase cancelada",
        body: `${cls.classType.name} ha sido cancelada: ${input.reason}`,
        url: "/my/bookings",
      }, tenantId).catch(() => {});
    }
  }

  return {
    success: true,
    summary: `Clase "${cls.classType.name}" cancelada. ${notifiedCount} miembros notificados.`,
    reason: input.reason,
  };
}

async function sendAnnouncement(
  input: { title: string; message: string; segment: string },
  tenantId: string,
) {
  const confirmedOrAttended = { in: CONFIRMED_OR_ATTENDED };

  let userIds: string[] = [];
  switch (input.segment) {
    case "all": {
      const members = await prisma.membership.findMany({
        where: { tenantId, role: "CLIENT" },
        select: { userId: true },
      });
      userIds = members.map((m) => m.userId);
      break;
    }
    case "active": {
      const since = daysAgo(30);
      const bookings = await prisma.booking.findMany({
        where: { class: { tenantId }, status: confirmedOrAttended, createdAt: { gte: since } },
        select: { userId: true },
        distinct: ["userId"],
      });
      userIds = bookings.filter((b) => b.userId).map((b) => b.userId!);
      break;
    }
    case "at_risk": {
      const atRiskDate = daysAgo(14);
      const members = await prisma.membership.findMany({
        where: { tenantId, role: "CLIENT" },
        include: {
          user: {
            select: {
              id: true,
              bookings: {
                where: { class: { tenantId }, status: confirmedOrAttended },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
      });
      userIds = members
        .filter((m) => {
          const last = m.user.bookings[0]?.createdAt;
          return !last || last < atRiskDate;
        })
        .map((m) => m.userId);
      break;
    }
    case "new": {
      const members = await prisma.membership.findMany({
        where: { tenantId, role: "CLIENT", createdAt: { gte: daysAgo(30) } },
        select: { userId: true },
      });
      userIds = members.map((m) => m.userId);
      break;
    }
  }

  let sentCount = 0;
  for (const userId of userIds) {
    sendPushToUser(userId, {
      title: input.title,
      body: input.message,
      url: "/my",
    }, tenantId).catch(() => {});
    sentCount++;
  }

  return {
    success: true,
    summary: `Anuncio "${input.title}" enviado a ${sentCount} miembros (segmento: ${input.segment}).`,
  };
}

// ─── NEW WRITE TOOLS ────────────────────────────────────────

async function createStudio(
  input: { name: string; city_id: string; address?: string; latitude?: number; longitude?: number },
  tenantId: string,
) {
  const city = await prisma.city.findUnique({ where: { id: input.city_id } });
  if (!city) return { error: "Ciudad no encontrada con ese ID" };

  const studio = await prisma.studio.create({
    data: {
      name: input.name,
      address: input.address || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      cityId: input.city_id,
      tenantId,
    },
    include: {
      city: { include: { country: true } },
    },
  });

  return {
    success: true,
    studio_id: studio.id,
    summary: `Estudio "${studio.name}" creado en ${studio.city.name}, ${studio.city.country.name}.`,
  };
}

async function createRoom(
  input: { name: string; studio_id: string; max_capacity: number; class_type_ids: string[] },
  tenantId: string,
) {
  const studio = await prisma.studio.findFirst({
    where: { id: input.studio_id, tenantId },
  });
  if (!studio) return { error: "Estudio no encontrado" };

  if (!input.class_type_ids?.length) {
    return { error: "Se requiere al menos una disciplina" };
  }

  const room = await prisma.room.create({
    data: {
      name: input.name,
      studioId: input.studio_id,
      tenantId,
      maxCapacity: input.max_capacity,
      classTypes: { connect: input.class_type_ids.map((id) => ({ id })) },
    },
    include: {
      classTypes: { select: { name: true } },
      studio: { select: { name: true } },
    },
  });

  return {
    success: true,
    room_id: room.id,
    summary: `Sala "${room.name}" creada en ${room.studio.name} (capacidad: ${room.maxCapacity}, disciplinas: ${room.classTypes.map((ct) => ct.name).join(", ")}).`,
  };
}

async function inviteCoach(
  input: { name: string; email?: string },
  tenantId: string,
) {
  const coachName = input.name?.trim();
  if (!coachName) return { error: "Nombre del coach es requerido" };

  const normalizedEmail = input.email?.toLowerCase().trim() || null;

  if (!normalizedEmail) {
    const coach = await prisma.coachProfile.create({
      data: { name: coachName, tenantId },
    });
    return {
      success: true,
      coach_id: coach.id,
      summary: `Coach "${coachName}" creado sin cuenta de usuario.`,
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      coachProfiles: { where: { tenantId } },
      memberships: { where: { tenantId } },
    },
  });

  if (existing?.coachProfiles?.length && existing.memberships.some((m) => m.role === "COACH")) {
    return { error: "Este usuario ya es coach en este studio" };
  }

  if (existing) {
    await prisma.$transaction(async (tx) => {
      if (!existing.coachProfiles?.length) {
        await tx.coachProfile.create({
          data: { name: coachName, userId: existing.id, tenantId },
        });
      } else {
        await tx.coachProfile.update({
          where: { id: existing.coachProfiles[0].id },
          data: { name: coachName },
        });
      }
      const existingMembership = existing.memberships[0];
      if (existingMembership) {
        await tx.membership.update({
          where: { id: existingMembership.id },
          data: { role: "COACH" },
        });
      } else {
        await tx.membership.create({
          data: { userId: existing.id, tenantId, role: "COACH" },
        });
      }
    });

    return {
      success: true,
      summary: `Coach "${coachName}" vinculado a cuenta existente (${normalizedEmail}).`,
    };
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: coachName,
    },
  });

  await prisma.$transaction([
    prisma.coachProfile.create({
      data: { name: coachName, userId: user.id, tenantId },
    }),
    prisma.membership.create({
      data: { userId: user.id, tenantId, role: "COACH" },
    }),
  ]);

  return {
    success: true,
    summary: `Coach "${input.name || normalizedEmail}" creado e invitado.`,
  };
}

async function createClient(
  input: { email: string; name?: string; phone?: string },
  tenantId: string,
) {
  const normalizedEmail = input.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { memberships: { where: { tenantId } } },
  });

  if (existing?.memberships?.length) {
    return { error: `El usuario "${normalizedEmail}" ya es miembro de este studio` };
  }

  if (existing) {
    await prisma.membership.create({
      data: { userId: existing.id, tenantId, role: "CLIENT" },
    });
    return {
      success: true,
      summary: `Usuario existente "${existing.name || normalizedEmail}" agregado como cliente.`,
    };
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: input.name || null,
      phone: input.phone || null,
    },
  });

  await prisma.membership.create({
    data: { userId: user.id, tenantId, role: "CLIENT" },
  });

  return {
    success: true,
    summary: `Cliente "${input.name || normalizedEmail}" registrado exitosamente.`,
  };
}

async function createClassType(
  input: {
    name: string;
    duration: number;
    color: string;
    description?: string;
    level?: string;
    icon?: string;
    tags?: string[];
  },
  tenantId: string,
) {
  const validLevels = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL"] as const;
  const level = validLevels.includes(input.level as (typeof validLevels)[number])
    ? (input.level as (typeof validLevels)[number])
    : "ALL";

  const classType = await prisma.classType.create({
    data: {
      name: input.name,
      duration: input.duration,
      color: input.color,
      description: input.description || null,
      level,
      icon: input.icon || null,
      tags: input.tags || [],
      tenantId,
    },
  });

  return {
    success: true,
    class_type_id: classType.id,
    summary: `Disciplina "${classType.name}" creada (${classType.duration} min, nivel: ${classType.level}).`,
  };
}

async function createPost(
  input: {
    title: string;
    body: string;
    category?: string;
    send_push?: boolean;
    is_pinned?: boolean;
  },
  tenantId: string,
  adminUserId?: string,
) {
  if (!adminUserId) {
    const admin = await prisma.membership.findFirst({
      where: { tenantId, role: "ADMIN" },
      select: { userId: true },
    });
    adminUserId = admin?.userId;
  }

  if (!adminUserId) return { error: "No se encontró un admin para publicar" };

  const validCategories = ["announcement", "challenge", "photo", "motivation"];
  const category = validCategories.includes(input.category || "")
    ? input.category!
    : "announcement";

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, appIconUrl: true },
  });

  if (input.is_pinned) {
    await prisma.feedEvent.updateMany({
      where: { tenantId, isPinned: true },
      data: { isPinned: false },
    });
  }

  const event = await prisma.feedEvent.create({
    data: {
      userId: adminUserId,
      tenantId,
      eventType: "STUDIO_POST",
      visibility: "STUDIO_WIDE",
      isPinned: !!input.is_pinned,
      payload: {
        isStudioPost: true,
        title: input.title || null,
        body: input.body || null,
        category,
        sentPush: !!input.send_push,
        postAsAdmin: false,
        authorName: tenant?.name ?? "Studio",
        authorImage: tenant?.appIconUrl ?? null,
      },
    },
  });

  if (input.send_push) {
    const subs = await prisma.pushSubscription.findMany({
      where: { tenantId },
      select: { userId: true },
      distinct: ["userId"],
    });
    for (const sub of subs) {
      sendPushToUser(sub.userId, {
        title: input.title || "Nuevo post del studio",
        body: input.body.length > 120 ? input.body.slice(0, 117) + "..." : input.body,
        url: `/my?post=${event.id}`,
      }, tenantId).catch(() => {});
    }
  }

  return {
    success: true,
    post_id: event.id,
    summary: `Post "${input.title}" publicado en el feed${input.is_pinned ? " (fijado)" : ""}${input.send_push ? " con push" : ""}.`,
  };
}

// ─── AVAILABILITY TOOLS ──────────────────────────────────────

async function getAvailabilityCoverage(
  input: { week_start?: string },
  tenantId: string,
) {
  const baseDate = input.week_start ? new Date(input.week_start) : new Date();
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const coachProfiles = await prisma.coachProfile.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  const allBlocks = await prisma.coachAvailabilityBlock.findMany({
    where: {
      tenantId,
      coachId: { in: coachProfiles.map((p) => p.userId).filter((id): id is string => id != null) },
      status: { in: ["active", "pending_approval"] },
    },
  });

  const scheduledClasses = await prisma.class.findMany({
    where: {
      tenantId,
      startsAt: { gte: weekStart, lte: weekEnd },
      status: "SCHEDULED",
    },
    select: { coachId: true, startsAt: true },
  });

  const classesByCoachDay: Record<string, boolean> = {};
  for (const c of scheduledClasses) {
    classesByCoachDay[`${c.coachId}_${format(c.startsAt, "yyyy-MM-dd")}`] = true;
  }

  const coaches = coachProfiles.map((profile) => {
    const coachBlocks = allBlocks.filter((b) => b.coachId === profile.userId);

    const dayCoverage = days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const hasClass = classesByCoachDay[`${profile.id}_${dateStr}`] ?? false;
      let status = getCoverageStatus(coachBlocks, day);
      if (status === "available" && !hasClass) status = "empty";

      return {
        date: dateStr,
        day_name: format(day, "EEE d MMM", { locale: es }),
        status,
        has_class: hasClass,
      };
    });

    return {
      coach_name: profile.name || "Coach",
      coach_profile_id: profile.id,
      specialties: profile.specialties,
      days: dayCoverage,
    };
  });

  return {
    week: `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM yyyy", { locale: es })}`,
    coaches,
    summary: {
      total_coaches: coaches.length,
      fully_available_days: coaches.reduce(
        (s, c) => s + c.days.filter((d) => d.status === "available").length,
        0,
      ),
      blocked_days: coaches.reduce(
        (s, c) => s + c.days.filter((d) => d.status === "blocked").length,
        0,
      ),
      pending_days: coaches.reduce(
        (s, c) => s + c.days.filter((d) => d.status === "pending").length,
        0,
      ),
    },
  };
}

async function getAvailabilityPending(tenantId: string) {
  const tenantConfig = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { zoneRedDays: true, zoneYellowDays: true },
  });

  const blocks = await prisma.coachAvailabilityBlock.findMany({
    where: { tenantId, status: "pending_approval" },
    include: {
      coach: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const enriched = await Promise.all(
    blocks.map(async (block) => {
      const coachProfile = await prisma.coachProfile.findFirst({
        where: { userId: block.coachId, tenantId },
        select: { id: true },
      });

      let affectedClasses: {
        class_id: string;
        date: string;
        time: string;
        class_type: string;
        enrolled: number;
        capacity: number;
        has_substitute: boolean;
        substitute_name: string | null;
      }[] = [];

      if (block.type === "one_time" && block.startDate && block.endDate) {
        const classes = await prisma.class.findMany({
          where: {
            tenantId,
            coachId: coachProfile?.id ?? "__none__",
            status: "SCHEDULED",
            startsAt: { gte: block.startDate, lte: block.endDate },
          },
          include: {
            classType: { select: { name: true } },
            room: { select: { maxCapacity: true } },
            _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
          },
          orderBy: { startsAt: "asc" },
        });

        affectedClasses = await Promise.all(
          classes.map(async (c) => {
            const subs = await getSubstituteSuggestions(c.id, c.startsAt, tenantId);
            const best = subs.find((s) => s.available) ?? null;
            return {
              class_id: c.id,
              date: format(c.startsAt, "EEE d MMM", { locale: es }),
              time: format(c.startsAt, "HH:mm"),
              class_type: c.classType.name,
              enrolled: c._count.bookings,
              capacity: c.room.maxCapacity,
              has_substitute: !!best,
              substitute_name: best?.name ?? null,
            };
          }),
        );
      }

      const zone = block.startDate ? getZone(block.startDate, tenantConfig) : "green";
      const reasonLabels: Record<string, string> = {
        vacation: "Vacaciones",
        personal: "Personal",
        training: "Formación",
        other: "Otro",
      };

      return {
        block_id: block.id,
        coach_name: block.coach.name,
        coach_email: block.coach.email,
        type: block.type,
        start_date: block.startDate
          ? format(block.startDate, "d MMM yyyy", { locale: es })
          : null,
        end_date: block.endDate
          ? format(block.endDate, "d MMM yyyy", { locale: es })
          : null,
        reason: reasonLabels[block.reasonType] || block.reasonType,
        reason_note: block.reasonNote,
        zone,
        affected_classes: affectedClasses,
        uncovered_classes: affectedClasses.filter((c) => !c.has_substitute).length,
      };
    }),
  );

  return {
    pending_count: enriched.length,
    total_uncovered_classes: enriched.reduce((s, b) => s + b.uncovered_classes, 0),
    requests: enriched,
  };
}

async function getSubstituteSuggestionsAI(
  input: { class_id: string; date: string },
  tenantId: string,
) {
  const suggestions = await getSubstituteSuggestions(
    input.class_id,
    new Date(input.date),
    tenantId,
  );

  return {
    class_id: input.class_id,
    date: input.date,
    suggestions: suggestions.map((s) => ({
      coach_name: s.name,
      coach_profile_id: s.coachProfileId,
      available: s.available,
      has_discipline: s.hasDiscipline,
      week_load: s.weekLoad,
    })),
  };
}

async function reviewAvailabilityRequest(
  input: { block_id: string; action: "approve" | "reject"; rejection_note?: string },
  tenantId: string,
  adminUserId?: string,
) {
  const block = await prisma.coachAvailabilityBlock.findFirst({
    where: { id: input.block_id, tenantId, status: "pending_approval" },
    include: { coach: { select: { name: true } } },
  });

  if (!block) return { error: "Solicitud no encontrada o ya fue revisada" };

  const dateRange =
    block.startDate && block.endDate
      ? `${format(block.startDate, "d MMM", { locale: es })} – ${format(block.endDate, "d MMM", { locale: es })}`
      : "fechas indicadas";

  if (input.action === "approve") {
    await prisma.coachAvailabilityBlock.update({
      where: { id: input.block_id },
      data: {
        status: "active",
        approvedBy: adminUserId || null,
        approvedAt: new Date(),
      },
    });

    if (adminUserId) {
      await prisma.notification.create({
        data: {
          userId: block.coachId,
          tenantId,
          type: "availability_approved",
          actorId: adminUserId,
        },
      });
    }

    return {
      success: true,
      summary: `Solicitud de ${block.coach.name} aprobada (${dateRange}). El coach ha sido notificado.`,
    };
  } else {
    await prisma.coachAvailabilityBlock.update({
      where: { id: input.block_id },
      data: {
        status: "rejected",
        rejectionNote: input.rejection_note || null,
      },
    });

    if (adminUserId) {
      await prisma.notification.create({
        data: {
          userId: block.coachId,
          tenantId,
          type: "availability_rejected",
          actorId: adminUserId,
        },
      });
    }

    return {
      success: true,
      summary: `Solicitud de ${block.coach.name} rechazada (${dateRange}).${input.rejection_note ? ` Motivo: ${input.rejection_note}` : ""} El coach ha sido notificado.`,
    };
  }
}

// ─── PHASE 1: NEW READ TOOLS ────────────────────────────────

async function getPackagesOverview(
  input: { period_days?: number; include_expiring?: boolean },
  tenantId: string,
) {
  const days = input.period_days ?? 30;
  const since = daysAgo(days);
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);

  const [packages, recentSales, allUserPackages] = await Promise.all([
    prisma.package.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        price: true,
        credits: true,
        validDays: true,
        currency: true,
        _count: { select: { userPackages: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.userPackage.findMany({
      where: { tenantId, purchasedAt: { gte: since } },
      include: {
        package: { select: { name: true, type: true, price: true } },
        user: { select: { name: true } },
      },
      orderBy: { purchasedAt: "desc" },
    }),
    prisma.userPackage.findMany({
      where: { tenantId, expiresAt: { gte: now } },
      include: {
        package: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const totalRevenue = recentSales.reduce((s, p) => s + p.package.price, 0);

  const salesByPackage = new Map<string, { name: string; count: number; revenue: number }>();
  for (const sale of recentSales) {
    const key = sale.package.name;
    const existing = salesByPackage.get(key) ?? { name: key, count: 0, revenue: 0 };
    existing.count++;
    existing.revenue += sale.package.price;
    salesByPackage.set(key, existing);
  }

  let totalCreditsAvailable = 0;
  let totalCreditsUsed = 0;
  for (const up of allUserPackages) {
    if (up.creditsTotal) {
      totalCreditsAvailable += up.creditsTotal - up.creditsUsed;
      totalCreditsUsed += up.creditsUsed;
    }
  }

  const result: Record<string, unknown> = {
    active_packages: packages.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      price: p.price,
      currency: p.currency,
      credits: p.credits,
      valid_days: p.validDays,
      total_sold: p._count.userPackages,
    })),
    period_days: days,
    recent_sales: {
      total_sales: recentSales.length,
      total_revenue: totalRevenue,
      by_package: Array.from(salesByPackage.values()).sort((a, b) => b.revenue - a.revenue),
    },
    active_user_packages: allUserPackages.length,
    credits: {
      total_available: totalCreditsAvailable,
      total_used: totalCreditsUsed,
      usage_pct: totalCreditsAvailable + totalCreditsUsed > 0
        ? Math.round((totalCreditsUsed / (totalCreditsAvailable + totalCreditsUsed)) * 100)
        : 0,
    },
  };

  if (input.include_expiring) {
    const expiring = allUserPackages
      .filter((up) => up.expiresAt <= sevenDaysFromNow)
      .map((up) => ({
        user_name: up.user.name,
        package_name: up.package.name,
        expires_at: up.expiresAt.toISOString(),
        credits_remaining: up.creditsTotal ? up.creditsTotal - up.creditsUsed : "unlimited",
      }))
      .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());

    result.expiring_soon = { count: expiring.length, packages: expiring.slice(0, 20) };
  }

  return result;
}

async function getSubscriptionsStatus(
  input: { include_members?: boolean },
  tenantId: string,
) {
  const subscriptions = await prisma.memberSubscription.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      package: { select: { name: true, price: true, recurringInterval: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const byStatus = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    const list = byStatus.get(sub.status) ?? [];
    list.push(sub);
    byStatus.set(sub.status, list);
  }

  const activeSubs = byStatus.get("active") ?? [];
  const mrr = activeSubs.reduce((s, sub) => {
    const price = sub.package.price;
    const interval = sub.package.recurringInterval;
    if (interval === "year") return s + price / 12;
    if (interval === "week") return s + price * 4.33;
    return s + price;
  }, 0);

  const thirtyDaysAgo = daysAgo(30);
  const recentCancellations = subscriptions.filter(
    (s) => s.status === "canceled" && s.canceledAt && s.canceledAt >= thirtyDaysAgo,
  );
  const cancelingAtEnd = activeSubs.filter((s) => s.cancelAtPeriodEnd);

  const result: Record<string, unknown> = {
    total_subscriptions: subscriptions.length,
    by_status: Object.fromEntries(
      Array.from(byStatus.entries()).map(([status, subs]) => [status, subs.length]),
    ),
    mrr: Math.round(mrr * 100) / 100,
    churn_last_30_days: recentCancellations.length,
    canceling_at_period_end: cancelingAtEnd.length,
    paused: (byStatus.get("paused") ?? []).length,
  };

  if (input.include_members) {
    const membersByStatus: Record<string, { name: string | null; email: string; package: string; since: string }[]> = {};
    for (const [status, subs] of byStatus.entries()) {
      membersByStatus[status] = subs.slice(0, 15).map((s) => ({
        name: s.user.name,
        email: s.user.email,
        package: s.package.name,
        since: s.createdAt.toISOString(),
      }));
    }
    result.members_by_status = membersByStatus;
  }

  return result;
}

async function getFinanceSummary(
  input: { period_days?: number; breakdown_by?: string },
  tenantId: string,
) {
  const days = input.period_days ?? 30;
  const since = daysAgo(days);
  const prevSince = daysAgo(days * 2);

  const [stripePayments, prevStripe, posTransactions, prevPos] = await Promise.all([
    prisma.stripePayment.findMany({
      where: { tenantId, createdAt: { gte: since }, status: "succeeded" },
    }),
    prisma.stripePayment.findMany({
      where: { tenantId, createdAt: { gte: prevSince, lt: since }, status: "succeeded" },
    }),
    prisma.posTransaction.findMany({
      where: { tenantId, createdAt: { gte: since }, status: "completed" },
    }),
    prisma.posTransaction.findMany({
      where: { tenantId, createdAt: { gte: prevSince, lt: since }, status: "completed" },
    }),
  ]);

  const stripeTotal = stripePayments.reduce((s, p) => s + p.amount, 0);
  const stripeNet = stripePayments.reduce((s, p) => s + (p.netAmount ?? p.amount), 0);
  const stripeFees = stripePayments.reduce((s, p) => s + (p.stripeFee ?? 0) + (p.applicationFee ?? 0), 0);
  const posTotal = posTransactions.reduce((s, p) => s + p.amount, 0);
  const posNet = posTransactions.reduce((s, p) => s + (p.netAmount ?? p.amount), 0);

  const prevTotal = prevStripe.reduce((s, p) => s + p.amount, 0) +
    prevPos.reduce((s, p) => s + p.amount, 0);
  const currentTotal = stripeTotal + posTotal;

  const result: Record<string, unknown> = {
    period_days: days,
    total_revenue: Math.round(currentTotal * 100) / 100,
    prev_period_revenue: Math.round(prevTotal * 100) / 100,
    change_pct: prevTotal > 0 ? Math.round(((currentTotal - prevTotal) / prevTotal) * 100) : null,
    stripe: {
      gross: Math.round(stripeTotal * 100) / 100,
      fees: Math.round(stripeFees * 100) / 100,
      net: Math.round(stripeNet * 100) / 100,
      transactions: stripePayments.length,
    },
    pos: {
      gross: Math.round(posTotal * 100) / 100,
      net: Math.round(posNet * 100) / 100,
      transactions: posTransactions.length,
    },
    total_net: Math.round((stripeNet + posNet) * 100) / 100,
  };

  if (input.breakdown_by === "type") {
    const byType = new Map<string, { count: number; revenue: number }>();
    for (const p of stripePayments) {
      const key = p.type;
      const existing = byType.get(key) ?? { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += p.amount;
      byType.set(key, existing);
    }
    for (const p of posTransactions) {
      const key = p.type;
      const existing = byType.get(key) ?? { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += p.amount;
      byType.set(key, existing);
    }
    result.breakdown = Array.from(byType.entries())
      .map(([type, data]) => ({ type, ...data, revenue: Math.round(data.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  } else if (input.breakdown_by === "method") {
    const byMethod = new Map<string, { count: number; revenue: number }>();
    for (const p of stripePayments) {
      const key = "stripe_online";
      const existing = byMethod.get(key) ?? { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += p.amount;
      byMethod.set(key, existing);
    }
    for (const p of posTransactions) {
      const key = p.paymentMethod;
      const existing = byMethod.get(key) ?? { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += p.amount;
      byMethod.set(key, existing);
    }
    result.breakdown = Array.from(byMethod.entries())
      .map(([method, data]) => ({ method, ...data, revenue: Math.round(data.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue);
  } else if (input.breakdown_by === "day") {
    const byDay = new Map<string, number>();
    for (const p of stripePayments) {
      const key = p.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + p.amount);
    }
    for (const p of posTransactions) {
      const key = p.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + p.amount);
    }
    result.breakdown = Array.from(byDay.entries())
      .map(([day, revenue]) => ({ day, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  return result;
}

async function getCheckinStats(
  input: { date?: string; period_days?: number },
  tenantId: string,
) {
  const targetDate = input.date ? new Date(input.date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const [todayClasses, checkIns, bookings] = await Promise.all([
    prisma.class.findMany({
      where: { tenantId, startsAt: { gte: dayStart, lte: dayEnd }, status: { not: "CANCELLED" } },
      include: {
        classType: { select: { name: true } },
        coach: { select: { name: true } },
        room: { select: { maxCapacity: true } },
        _count: {
          select: {
            bookings: { where: { status: { in: CONFIRMED_OR_ATTENDED } } },
            checkIns: true,
          },
        },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.checkIn.findMany({
      where: { tenantId, createdAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.booking.findMany({
      where: {
        class: { tenantId, startsAt: { gte: dayStart, lte: dayEnd } },
        status: { in: ["CONFIRMED", "ATTENDED", "NO_SHOW"] },
      },
    }),
  ]);

  const noShows = bookings.filter((b) => b.status === "NO_SHOW").length;
  const attended = bookings.filter((b) => b.status === "ATTENDED").length;
  const confirmed = bookings.filter((b) => b.status === "CONFIRMED").length;

  const byMethod = new Map<string, number>();
  for (const ci of checkIns) {
    byMethod.set(ci.method, (byMethod.get(ci.method) ?? 0) + 1);
  }

  const classes = todayClasses.map((c) => ({
    class_type: c.classType.name,
    coach: c.coach.name,
    starts_at: c.startsAt.toISOString(),
    capacity: c.room.maxCapacity,
    booked: c._count.bookings,
    checked_in: c._count.checkIns,
    checkin_rate_pct: c._count.bookings > 0
      ? Math.round((c._count.checkIns / c._count.bookings) * 100)
      : 0,
  }));

  const result: Record<string, unknown> = {
    date: dayStart.toISOString().slice(0, 10),
    total_classes: todayClasses.length,
    total_bookings: bookings.length,
    total_checkins: checkIns.length,
    attended,
    no_shows: noShows,
    still_confirmed: confirmed,
    attendance_rate_pct: bookings.length > 0
      ? Math.round(((attended + checkIns.length) / bookings.length) * 100)
      : 0,
    by_method: Object.fromEntries(byMethod),
    classes,
  };

  if (input.period_days) {
    const trendSince = daysAgo(input.period_days);
    const [trendCheckIns, trendBookings] = await Promise.all([
      prisma.checkIn.count({ where: { tenantId, createdAt: { gte: trendSince } } }),
      prisma.booking.count({
        where: {
          class: { tenantId, startsAt: { gte: trendSince } },
          status: { in: ["ATTENDED", "NO_SHOW", "CONFIRMED"] },
        },
      }),
    ]);
    result.trend = {
      period_days: input.period_days,
      total_checkins: trendCheckIns,
      total_bookings: trendBookings,
      avg_attendance_rate_pct: trendBookings > 0
        ? Math.round((trendCheckIns / trendBookings) * 100)
        : 0,
    };
  }

  return result;
}

async function getPlatformStatus(
  input: { platform?: string; period_days?: number },
  tenantId: string,
) {
  const days = input.period_days ?? 7;
  const since = daysAgo(days);
  const platformFilter = input.platform && input.platform !== "all"
    ? { platform: input.platform as "classpass" | "gympass" }
    : {};

  const [configs, alerts, bookings, quotas] = await Promise.all([
    prisma.studioPlatformConfig.findMany({
      where: { tenantId, ...platformFilter },
    }),
    prisma.platformAlert.findMany({
      where: { tenantId, ...platformFilter, isResolved: false },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.platformBooking.findMany({
      where: { tenantId, ...platformFilter, createdAt: { gte: since } },
      include: {
        class: {
          select: { startsAt: true, classType: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.schedulePlatformQuota.findMany({
      where: {
        tenantId,
        ...platformFilter,
        class: { startsAt: { gte: new Date() } },
      },
      include: {
        class: {
          select: {
            startsAt: true,
            classType: { select: { name: true } },
            room: { select: { maxCapacity: true } },
          },
        },
      },
    }),
  ]);

  const bookingsByPlatform = new Map<string, { total: number; confirmed: number; cancelled: number; checked_in: number }>();
  for (const b of bookings) {
    const key = b.platform;
    const existing = bookingsByPlatform.get(key) ?? { total: 0, confirmed: 0, cancelled: 0, checked_in: 0 };
    existing.total++;
    if (b.status === "confirmed") existing.confirmed++;
    if (b.status === "cancelled") existing.cancelled++;
    if (b.status === "checked_in") existing.checked_in++;
    bookingsByPlatform.set(key, existing);
  }

  return {
    platforms: configs.map((c) => ({
      platform: c.platform,
      is_active: c.isActive,
      activated_at: c.activatedAt?.toISOString() ?? null,
      rate_per_visit: c.ratePerVisit,
      inbound_email: c.inboundEmail,
    })),
    unresolved_alerts: alerts.map((a) => ({
      id: a.id,
      platform: a.platform,
      type: a.type,
      message: a.message,
      created_at: a.createdAt.toISOString(),
    })),
    bookings_summary: Object.fromEntries(
      Array.from(bookingsByPlatform.entries()).map(([platform, stats]) => [platform, stats]),
    ),
    period_days: days,
    upcoming_quotas: quotas.slice(0, 20).map((q) => ({
      platform: q.platform,
      class_type: q.class.classType.name,
      starts_at: q.class.startsAt.toISOString(),
      quota_spots: q.quotaSpots,
      booked_spots: q.bookedSpots,
      available: q.quotaSpots - q.bookedSpots,
      is_closed: q.isClosedManually,
    })),
    estimated_revenue: Array.from(bookingsByPlatform.entries()).reduce((total, [platform, stats]) => {
      const config = configs.find((c) => c.platform === platform);
      return total + (stats.confirmed + stats.checked_in) * (config?.ratePerVisit ?? 0);
    }, 0),
  };
}

async function getClientDetail(
  input: { client_id?: string; client_name?: string; client_email?: string },
  tenantId: string,
) {
  if (!input.client_id && !input.client_name && !input.client_email) {
    return { error: "Proporciona al menos client_id, client_name o client_email" };
  }

  const userWhere: Record<string, unknown> = {};
  if (input.client_id) {
    userWhere.id = input.client_id;
  } else if (input.client_email) {
    userWhere.email = input.client_email.toLowerCase().trim();
  } else if (input.client_name) {
    userWhere.name = { contains: input.client_name, mode: "insensitive" };
  }

  const users = await prisma.user.findMany({
    where: {
      ...userWhere,
      memberships: { some: { tenantId, role: "CLIENT" } },
    },
    take: 5,
    include: {
      memberships: {
        where: { tenantId },
        include: {
          referredByMembership: { select: { user: { select: { name: true, email: true } } } },
          _count: { select: { referrals: true } },
        },
      },
      packages: {
        where: { tenantId },
        include: { package: { select: { name: true, type: true, credits: true } } },
        orderBy: { purchasedAt: "desc" },
      },
      memberSubscriptions: {
        where: { tenantId },
        include: { package: { select: { name: true, price: true } } },
      },
      bookings: {
        where: { class: { tenantId }, status: { in: CONFIRMED_OR_ATTENDED } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          class: {
            include: {
              classType: { select: { name: true } },
              coach: { select: { name: true } },
            },
          },
        },
      },
      stripePayments: {
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { amount: true, type: true, status: true, concept: true, createdAt: true },
      },
      waiverSignatures: {
        where: { tenantId },
        take: 1,
        orderBy: { signedAt: "desc" },
        select: { signedAt: true, waiverVersion: true },
      },
      memberProgressRows: {
        where: { tenantId },
        include: { currentLevel: { select: { name: true, icon: true } } },
      },
      memberAchievements: {
        where: { tenantId },
        include: { achievement: { select: { name: true, icon: true } } },
        orderBy: { earnedAt: "desc" },
        take: 10,
      },
    },
  });

  if (users.length === 0) return { error: "Cliente no encontrado" };

  return users.map((u) => {
    const membership = u.memberships[0];
    const progress = u.memberProgressRows[0];
    const activePackages = u.packages.filter((p) => p.expiresAt >= new Date());

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      birthday: u.birthday?.toISOString().slice(0, 10) ?? null,
      joined: membership?.createdAt.toISOString() ?? u.createdAt.toISOString(),
      lifecycle_stage: membership?.lifecycleStage ?? null,
      referred_by: membership?.referredByMembership
        ? `${membership.referredByMembership.user.name} (${membership.referredByMembership.user.email})`
        : null,
      referrals_made: membership?._count.referrals ?? 0,
      active_packages: activePackages.map((p) => ({
        name: p.package.name,
        type: p.package.type,
        credits_remaining: p.creditsTotal ? p.creditsTotal - p.creditsUsed : "unlimited",
        expires_at: p.expiresAt.toISOString(),
      })),
      all_packages_count: u.packages.length,
      active_subscription: u.memberSubscriptions.length > 0
        ? u.memberSubscriptions.map((s) => ({
            package: s.package.name,
            status: s.status,
            price: s.package.price,
            current_period_end: s.currentPeriodEnd.toISOString(),
            cancel_at_period_end: s.cancelAtPeriodEnd,
          }))
        : null,
      recent_bookings: u.bookings.map((b) => ({
        class_type: b.class.classType.name,
        coach: b.class.coach.name,
        date: b.class.startsAt.toISOString(),
        status: b.status,
      })),
      total_bookings: u.bookings.length,
      recent_payments: u.stripePayments.map((p) => ({
        amount: p.amount,
        type: p.type,
        status: p.status,
        concept: p.concept,
        date: p.createdAt.toISOString(),
      })),
      waiver: u.waiverSignatures.length > 0
        ? { signed: true, signed_at: u.waiverSignatures[0].signedAt.toISOString(), version: u.waiverSignatures[0].waiverVersion }
        : { signed: false },
      gamification: progress
        ? {
            level: progress.currentLevel?.name ?? null,
            level_icon: progress.currentLevel?.icon ?? null,
            total_classes: progress.totalClassesAttended,
            current_streak: progress.currentStreak,
            longest_streak: progress.longestStreak,
          }
        : null,
      achievements: u.memberAchievements.map((a) => ({
        name: a.achievement.name,
        icon: a.achievement.icon,
        earned_at: a.earnedAt.toISOString(),
      })),
    };
  });
}

async function getCoachDetail(
  input: { coach_id?: string; coach_name?: string },
  tenantId: string,
) {
  if (!input.coach_id && !input.coach_name) {
    return { error: "Proporciona al menos coach_id o coach_name" };
  }

  const where: Record<string, unknown> = { tenantId };
  if (input.coach_id) {
    where.id = input.coach_id;
  } else if (input.coach_name) {
    where.name = { contains: input.coach_name, mode: "insensitive" };
  }

  const since30 = daysAgo(30);
  const coaches = await prisma.coachProfile.findMany({
    where,
    take: 5,
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, image: true } },
      payRates: {
        where: { isActive: true },
        include: { classType: { select: { name: true } } },
      },
      classes: {
        where: { startsAt: { gte: since30 } },
        include: {
          classType: { select: { name: true } },
          room: { select: { maxCapacity: true } },
          _count: {
            select: {
              bookings: { where: { status: { in: CONFIRMED_OR_ATTENDED } } },
            },
          },
          ratings: {
            select: { rating: true, reasons: true, comment: true },
          },
        },
      },
    },
  });

  if (coaches.length === 0) return { error: "Coach no encontrado" };

  const coachIds = coaches.map((c) => c.userId).filter((id): id is string => id != null);
  const availabilityBlocks = coachIds.length > 0
    ? await prisma.coachAvailabilityBlock.findMany({
        where: { tenantId, coachId: { in: coachIds }, status: { in: ["active", "pending_approval"] } },
      })
    : [];

  return coaches.map((coach) => {
    const activeClasses = coach.classes.filter((c) => c.status !== "CANCELLED");
    const totalBookings = activeClasses.reduce((s, c) => s + c._count.bookings, 0);
    const totalCapacity = activeClasses.reduce((s, c) => s + c.room.maxCapacity, 0);
    const allRatings = activeClasses.flatMap((c) => c.ratings);
    const avgRating = allRatings.length > 0
      ? Math.round((allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length) * 10) / 10
      : null;

    const coachBlocks = availabilityBlocks.filter((b) => b.coachId === coach.userId);
    const activeBlocks = coachBlocks.filter((b) => b.status === "active");
    const pendingBlocks = coachBlocks.filter((b) => b.status === "pending_approval");

    return {
      coach_profile_id: coach.id,
      name: coach.name,
      email: coach.user?.email ?? null,
      phone: coach.user?.phone ?? null,
      photo: coach.photoUrl ?? coach.user?.image ?? null,
      bio: coach.bio,
      specialties: coach.specialties,
      color: coach.color,
      linked_user: !!coach.userId,
      pay_rates: coach.payRates.map((pr) => ({
        type: pr.type,
        amount: pr.amount,
        currency: pr.currency,
        class_type: pr.classType?.name ?? "Todas",
        bonus_multiplier: pr.bonusMultiplier,
      })),
      last_30_days: {
        total_classes: coach.classes.length,
        cancelled: coach.classes.filter((c) => c.status === "CANCELLED").length,
        total_bookings: totalBookings,
        avg_fill_rate_pct: totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0,
        avg_rating: avgRating,
        total_ratings: allRatings.length,
      },
      availability: {
        active_blocks: activeBlocks.length,
        pending_requests: pendingBlocks.length,
      },
    };
  });
}

async function getRatingsSummary(
  input: { period_days?: number; group_by?: string; coach_id?: string },
  tenantId: string,
) {
  const days = input.period_days ?? 30;
  const since = daysAgo(days);

  const where: Record<string, unknown> = { tenantId, createdAt: { gte: since } };
  if (input.coach_id) {
    where.class = { coachId: input.coach_id };
  }

  const ratings = await prisma.classRating.findMany({
    where,
    include: {
      class: {
        include: {
          classType: { select: { name: true } },
          coach: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (ratings.length === 0) {
    return { period_days: days, total_ratings: 0, message: "No hay ratings en este período" };
  }

  const avg = Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const allReasons = new Map<string, number>();
  for (const r of ratings) {
    distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
    for (const reason of r.reasons) {
      allReasons.set(reason, (allReasons.get(reason) ?? 0) + 1);
    }
  }

  const result: Record<string, unknown> = {
    period_days: days,
    total_ratings: ratings.length,
    average_rating: avg,
    distribution,
    top_reasons: Array.from(allReasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count })),
    low_ratings: ratings
      .filter((r) => r.rating <= 2)
      .slice(0, 10)
      .map((r) => ({
        rating: r.rating,
        class_type: r.class.classType.name,
        coach: r.class.coach.name,
        reasons: r.reasons,
        comment: r.comment,
        date: r.createdAt.toISOString(),
      })),
  };

  if (input.group_by === "coach") {
    const byCoach = new Map<string, { name: string; ratings: number[]; count: number }>();
    for (const r of ratings) {
      const key = r.class.coach.id;
      const existing = byCoach.get(key) ?? { name: r.class.coach.name, ratings: [], count: 0 };
      existing.ratings.push(r.rating);
      existing.count++;
      byCoach.set(key, existing);
    }
    result.by_coach = Array.from(byCoach.values())
      .map((c) => ({
        coach: c.name,
        total_ratings: c.count,
        avg_rating: Math.round((c.ratings.reduce((s, r) => s + r, 0) / c.count) * 10) / 10,
      }))
      .sort((a, b) => b.avg_rating - a.avg_rating);
  } else if (input.group_by === "class_type") {
    const byType = new Map<string, { ratings: number[]; count: number }>();
    for (const r of ratings) {
      const key = r.class.classType.name;
      const existing = byType.get(key) ?? { ratings: [], count: 0 };
      existing.ratings.push(r.rating);
      existing.count++;
      byType.set(key, existing);
    }
    result.by_class_type = Array.from(byType.entries())
      .map(([name, data]) => ({
        class_type: name,
        total_ratings: data.count,
        avg_rating: Math.round((data.ratings.reduce((s, r) => s + r, 0) / data.count) * 10) / 10,
      }))
      .sort((a, b) => b.avg_rating - a.avg_rating);
  }

  return result;
}

async function getGamificationOverview(
  input: { top_n?: number; include_achievements?: boolean },
  tenantId: string,
) {
  const topN = input.top_n ?? 10;

  const [levels, progress, recentAchievements, config] = await Promise.all([
    prisma.loyaltyLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.memberProgress.findMany({
      where: { tenantId },
      include: {
        user: { select: { name: true, email: true } },
        currentLevel: { select: { name: true, icon: true } },
      },
      orderBy: { totalClassesAttended: "desc" },
    }),
    prisma.memberAchievement.findMany({
      where: { tenantId },
      include: {
        achievement: { select: { name: true, icon: true, category: true } },
        user: { select: { name: true } },
      },
      orderBy: { earnedAt: "desc" },
      take: 50,
    }),
    prisma.tenantGamificationConfig.findFirst({ where: { tenantId } }),
  ]);

  const levelDistribution = new Map<string, number>();
  let noLevel = 0;
  for (const p of progress) {
    if (p.currentLevel) {
      const key = `${p.currentLevel.icon} ${p.currentLevel.name}`;
      levelDistribution.set(key, (levelDistribution.get(key) ?? 0) + 1);
    } else {
      noLevel++;
    }
  }

  const activeStreaks = progress.filter((p) => p.currentStreak > 0).length;
  const avgStreak = progress.length > 0
    ? Math.round((progress.reduce((s, p) => s + p.currentStreak, 0) / progress.length) * 10) / 10
    : 0;

  const result: Record<string, unknown> = {
    config: {
      levels_enabled: config?.levelsEnabled ?? true,
      achievements_enabled: config?.achievementsEnabled ?? true,
      auto_rewards_enabled: config?.autoRewardsEnabled ?? false,
    },
    total_members_with_progress: progress.length,
    level_distribution: {
      ...Object.fromEntries(levelDistribution),
      sin_nivel: noLevel,
    },
    levels: levels.map((l) => ({
      name: l.name,
      icon: l.icon,
      min_classes: l.minClasses,
      members: levelDistribution.get(`${l.icon} ${l.name}`) ?? 0,
    })),
    streaks: {
      active_streaks: activeStreaks,
      avg_streak: avgStreak,
      longest_streak: progress.length > 0 ? Math.max(...progress.map((p) => p.longestStreak)) : 0,
    },
    leaderboard: progress.slice(0, topN).map((p, i) => ({
      rank: i + 1,
      name: p.user.name,
      total_classes: p.totalClassesAttended,
      level: p.currentLevel ? `${p.currentLevel.icon} ${p.currentLevel.name}` : null,
      current_streak: p.currentStreak,
    })),
  };

  if (input.include_achievements) {
    const achievementCounts = new Map<string, { name: string; icon: string; category: string; count: number }>();
    for (const a of recentAchievements) {
      const key = a.achievement.name;
      const existing = achievementCounts.get(key) ?? {
        name: a.achievement.name,
        icon: a.achievement.icon,
        category: a.achievement.category,
        count: 0,
      };
      existing.count++;
      achievementCounts.set(key, existing);
    }

    result.recent_achievements = recentAchievements.slice(0, 20).map((a) => ({
      member: a.user.name,
      achievement: `${a.achievement.icon} ${a.achievement.name}`,
      earned_at: a.earnedAt.toISOString(),
    }));
    result.most_earned = Array.from(achievementCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((a) => ({ achievement: `${a.icon} ${a.name}`, category: a.category, earned_count: a.count }));
  }

  return result;
}

async function getReferralMetrics(
  input: { period_days?: number },
  tenantId: string,
) {
  const days = input.period_days ?? 30;
  const since = daysAgo(days);

  const [config, membershipsWithReferrals, rewards, recentReferrals] = await Promise.all([
    prisma.referralConfig.findFirst({ where: { tenantId } }),
    prisma.membership.findMany({
      where: { tenantId, role: "CLIENT", referralCode: { not: null } },
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { referrals: true } },
      },
    }),
    prisma.referralReward.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.membership.findMany({
      where: { tenantId, referredByMembershipId: { not: null }, createdAt: { gte: since } },
      include: {
        user: { select: { name: true } },
        referredByMembership: {
          select: { user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalReferrals = membershipsWithReferrals.reduce((s, m) => s + m._count.referrals, 0);
  const topReferrers = membershipsWithReferrals
    .filter((m) => m._count.referrals > 0)
    .sort((a, b) => b._count.referrals - a._count.referrals)
    .slice(0, 10);

  const pendingRewards = rewards.filter((r) => r.status === "pending").length;
  const deliveredRewards = rewards.filter((r) => r.status === "delivered").length;

  return {
    config: config
      ? {
          enabled: config.isEnabled,
          trigger_stage: config.triggerStage,
          referrer_reward: config.referrerRewardType,
          referrer_reward_text: config.referrerRewardText,
          referee_reward: config.refereeRewardType,
          referee_reward_text: config.refereeRewardText,
        }
      : null,
    total_referrals: totalReferrals,
    recent_referrals_count: recentReferrals.length,
    period_days: days,
    recent_referrals: recentReferrals.slice(0, 15).map((r) => ({
      new_member: r.user.name,
      referred_by: r.referredByMembership?.user.name ?? "Desconocido",
      joined: r.createdAt.toISOString(),
    })),
    rewards: {
      total: rewards.length,
      pending: pendingRewards,
      delivered: deliveredRewards,
    },
    top_referrers: topReferrers.map((m) => ({
      name: m.user.name,
      email: m.user.email,
      referrals: m._count.referrals,
      code: m.referralCode,
    })),
    members_with_code: membershipsWithReferrals.length,
  };
}
