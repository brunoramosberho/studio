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
      coach: { select: { id: true, user: { select: { name: true } } } },
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
        key = c.coach.user.name ?? c.coach.id;
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
      name: coach.user.name,
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
                coach: { select: { user: { select: { name: true } } } },
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
        const coach = b.class.coach.user.name ?? "Desconocido";
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
      coach: { select: { user: { select: { name: true } } } },
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
      coach: c.coach.user.name,
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
      coach: { select: { user: { select: { name: true } } } },
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
    coach: c.coach.user.name,
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
      coach: { select: { user: { select: { name: true } } } },
      room: { select: { name: true, studio: { select: { name: true } } } },
    },
  });

  return {
    success: true,
    class_id: newClass.id,
    summary: `Clase "${newClass.classType.name}" creada para ${newClass.startsAt.toLocaleDateString("es")} con ${newClass.coach.user.name} en ${newClass.room.studio.name} - ${newClass.room.name}`,
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
  input: { email: string; name?: string },
  tenantId: string,
) {
  const normalizedEmail = input.email.toLowerCase().trim();

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
          data: { userId: existing.id, tenantId },
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
      summary: `Coach existente "${existing.name || normalizedEmail}" vinculado al studio.`,
    };
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      name: input.name || null,
    },
  });

  await prisma.$transaction([
    prisma.coachProfile.create({
      data: { userId: user.id, tenantId },
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
        url: "/my",
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
      coachId: { in: coachProfiles.map((p) => p.userId) },
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
      coach_name: profile.user.name || "Coach",
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
