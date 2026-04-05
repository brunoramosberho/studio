import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(name: string, input: any, tenantId: string): Promise<unknown> {
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
  const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as const };

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
  const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as const };

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
  const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as const };

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
  const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as const };
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
  const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as const };

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
  const memberFilter: Record<string, unknown> = { tenantId, role: "CLIENT" as const };
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
          bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
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
  const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as const };

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
