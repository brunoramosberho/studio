import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

type Range = "today" | "month" | "last30" | "last90" | "year";

function getDateRange(range: Range) {
  const now = new Date();
  let start: Date;
  const end: Date = now;

  switch (range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last30":
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
    case "last90":
      start = new Date(now);
      start.setDate(start.getDate() - 90);
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { start, end };
}

interface ClassTypeStat {
  name: string;
  classesHeld: number;
  totalCapacity: number;
  seatsBooked: number;
  emptySeats: number;
  fillRate: number; // 0-100
  avgAttendees: number;
}

interface CoachStat {
  name: string;
  classesHeld: number;
  totalCapacity: number;
  seatsBooked: number;
  fillRate: number; // 0-100
  payType: string | null; // MONTHLY_FIXED | PER_CLASS | PER_STUDENT | OCCUPANCY_TIER | null
}

interface TimeSlotStat {
  dayOfWeek: number; // 0=Sun, 6=Sat
  dayLabel: string;
  hour: number; // 0-23
  classesHeld: number;
  fillRate: number;
}

interface CohortStat {
  month: string; // YYYY-MM
  joined: number;
  stillActive: number;
  retentionPct: number;
}

interface InsightsResponse {
  classTypeTop: ClassTypeStat[];
  classTypeBottom: ClassTypeStat[];
  coachTop: CoachStat[];
  coachBottom: CoachStat[];
  timeSlotTop: TimeSlotStat[];
  timeSlotBottom: TimeSlotStat[];
  mrrConcentration: {
    totalMrr: number;
    top10Share: number; // 0-100
    topMembers: { name: string; amount: number; packageName: string }[];
  };
  mrrAtRisk: {
    count: number;
    exposedMrr: number;
    members: { name: string; amount: number; daysInactive: number }[];
  };
  retentionCohorts: CohortStat[];
  waitlistHotspots: {
    classType: string;
    waitlistedClasses: number;
    totalWaitlisted: number;
  }[];
  meta: {
    range: string;
    classesAnalyzed: number;
    activeSubscriptions: number;
  };
}

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const params = request.nextUrl.searchParams;
    const range = (params.get("range") ?? "month") as Range;
    const { start, end } = getDateRange(range);
    const now = new Date();

    // Load classes within period that were not cancelled, with bookings + coach + room + type
    const classes = await prisma.class.findMany({
      where: {
        tenantId,
        startsAt: { gte: start, lte: end },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        startsAt: true,
        classType: { select: { id: true, name: true } },
        coach: {
          select: {
            id: true,
            name: true,
            payRates: {
              where: {
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
                effectiveFrom: { lte: now },
              },
              orderBy: { effectiveFrom: "desc" },
              select: { type: true, amount: true },
              take: 1,
            },
          },
        },
        room: { select: { maxCapacity: true } },
        bookings: {
          where: { status: { in: ["CONFIRMED", "ATTENDED"] } },
          select: { id: true },
        },
      },
    });

    // ─── Class Type aggregation ──────────────────────────────
    const typeAgg = new Map<string, { name: string; classes: number; capacity: number; booked: number }>();
    for (const c of classes) {
      const key = c.classType.id;
      const cap = c.room?.maxCapacity ?? 0;
      const booked = c.bookings.length;
      const entry = typeAgg.get(key) ?? { name: c.classType.name, classes: 0, capacity: 0, booked: 0 };
      entry.classes += 1;
      entry.capacity += cap;
      entry.booked += booked;
      typeAgg.set(key, entry);
    }
    const classTypeStats: ClassTypeStat[] = Array.from(typeAgg.values())
      .filter((e) => e.classes >= 2) // skip one-offs
      .map((e) => ({
        name: e.name,
        classesHeld: e.classes,
        totalCapacity: e.capacity,
        seatsBooked: e.booked,
        emptySeats: Math.max(0, e.capacity - e.booked),
        fillRate: e.capacity > 0 ? Math.round((e.booked / e.capacity) * 100) : 0,
        avgAttendees: e.classes > 0 ? Math.round((e.booked / e.classes) * 10) / 10 : 0,
      }));
    const classTypeTop = [...classTypeStats].sort((a, b) => b.fillRate - a.fillRate).slice(0, 3);
    const classTypeBottom = [...classTypeStats]
      .sort((a, b) => a.fillRate - b.fillRate)
      .filter((c) => c.emptySeats > 0)
      .slice(0, 3);

    // ─── Coach aggregation ──────────────────────────────────
    const coachAgg = new Map<
      string,
      { name: string; classes: number; capacity: number; booked: number; payType: string | null }
    >();
    for (const c of classes) {
      const key = c.coach.id;
      const cap = c.room?.maxCapacity ?? 0;
      const booked = c.bookings.length;
      const entry =
        coachAgg.get(key) ?? {
          name: c.coach.name,
          classes: 0,
          capacity: 0,
          booked: 0,
          payType: c.coach.payRates[0]?.type ?? null,
        };
      entry.classes += 1;
      entry.capacity += cap;
      entry.booked += booked;
      coachAgg.set(key, entry);
    }
    const coachStats: CoachStat[] = Array.from(coachAgg.values())
      .filter((e) => e.classes >= 2)
      .map((e) => ({
        name: e.name,
        classesHeld: e.classes,
        totalCapacity: e.capacity,
        seatsBooked: e.booked,
        fillRate: e.capacity > 0 ? Math.round((e.booked / e.capacity) * 100) : 0,
        payType: e.payType,
      }));
    const coachTop = [...coachStats]
      .sort((a, b) => b.seatsBooked - a.seatsBooked || b.fillRate - a.fillRate)
      .slice(0, 3);
    const coachBottom = [...coachStats]
      .sort((a, b) => a.fillRate - b.fillRate || b.classesHeld - a.classesHeld)
      .slice(0, 3);

    // ─── Time slot aggregation (day × hour) ─────────────────
    const slotAgg = new Map<string, { day: number; hour: number; classes: number; capacity: number; booked: number }>();
    for (const c of classes) {
      const day = c.startsAt.getDay();
      const hour = c.startsAt.getHours();
      const key = `${day}-${hour}`;
      const cap = c.room?.maxCapacity ?? 0;
      const booked = c.bookings.length;
      const entry = slotAgg.get(key) ?? { day, hour, classes: 0, capacity: 0, booked: 0 };
      entry.classes += 1;
      entry.capacity += cap;
      entry.booked += booked;
      slotAgg.set(key, entry);
    }
    const slotStats: TimeSlotStat[] = Array.from(slotAgg.values())
      .filter((s) => s.classes >= 2)
      .map((s) => ({
        dayOfWeek: s.day,
        dayLabel: DAYS_ES[s.day],
        hour: s.hour,
        classesHeld: s.classes,
        fillRate: s.capacity > 0 ? Math.round((s.booked / s.capacity) * 100) : 0,
      }));
    const timeSlotTop = [...slotStats].sort((a, b) => b.fillRate - a.fillRate).slice(0, 3);
    const timeSlotBottom = [...slotStats].sort((a, b) => a.fillRate - b.fillRate).slice(0, 3);

    // ─── MRR concentration ─────────────────────────────────
    const activeSubs = await prisma.memberSubscription.findMany({
      where: { tenantId, status: "active" },
      select: {
        userId: true,
        package: { select: { name: true, price: true } },
        user: { select: { name: true } },
      },
    });
    const totalMrr = activeSubs.reduce((s, sub) => s + sub.package.price, 0);
    const sortedSubs = [...activeSubs].sort((a, b) => b.package.price - a.package.price);
    const topContributors = sortedSubs.slice(0, 10);
    const top10Amount = topContributors.reduce((s, sub) => s + sub.package.price, 0);

    // ─── MRR at risk (active subs whose members haven't booked in 21 days) ───
    const twentyOneDaysAgo = new Date(now);
    twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);
    const recentBookings = await prisma.booking.findMany({
      where: {
        tenantId,
        createdAt: { gte: twentyOneDaysAgo },
        status: { in: ["CONFIRMED", "ATTENDED"] },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    const activeUserIds = new Set(recentBookings.map((b) => b.userId).filter(Boolean) as string[]);
    const atRiskSubs = activeSubs.filter((sub) => !activeUserIds.has(sub.userId));

    // Compute each at-risk member's last booking to get daysInactive
    const atRiskUserIds = atRiskSubs.map((s) => s.userId);
    const lastBookingsRaw = atRiskUserIds.length
      ? await prisma.booking.groupBy({
          by: ["userId"],
          where: { tenantId, userId: { in: atRiskUserIds } },
          _max: { createdAt: true },
        })
      : [];
    const lastBookingMap = new Map<string, Date | null>();
    for (const row of lastBookingsRaw) {
      if (row.userId) lastBookingMap.set(row.userId, row._max.createdAt);
    }
    const atRiskDetailed = atRiskSubs
      .map((sub) => {
        const last = lastBookingMap.get(sub.userId);
        const daysInactive = last
          ? Math.floor((now.getTime() - last.getTime()) / 86400000)
          : 999;
        return {
          name: sub.user.name ?? "Sin nombre",
          amount: sub.package.price,
          daysInactive,
        };
      })
      .sort((a, b) => b.amount - a.amount);
    const exposedMrr = atRiskDetailed.reduce((s, m) => s + m.amount, 0);

    // ─── Retention cohorts (last 3 months of joiners) ─────
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const cohortsRaw = await prisma.memberSubscription.findMany({
      where: { tenantId, createdAt: { gte: threeMonthsAgo } },
      select: { createdAt: true, status: true },
    });
    const cohortMap = new Map<string, { joined: number; active: number }>();
    for (const sub of cohortsRaw) {
      const key = `${sub.createdAt.getFullYear()}-${String(sub.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const entry = cohortMap.get(key) ?? { joined: 0, active: 0 };
      entry.joined += 1;
      if (sub.status === "active") entry.active += 1;
      cohortMap.set(key, entry);
    }
    const retentionCohorts: CohortStat[] = Array.from(cohortMap.entries())
      .map(([month, e]) => ({
        month,
        joined: e.joined,
        stillActive: e.active,
        retentionPct: e.joined > 0 ? Math.round((e.active / e.joined) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ─── Waitlist hotspots ─────────────────────────────────
    const waitlistEntries = await prisma.waitlist.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lte: end },
      },
      select: { classId: true },
    });
    const waitlistClassIds = [...new Set(waitlistEntries.map((w) => w.classId))];
    const waitlistClasses = waitlistClassIds.length
      ? await prisma.class.findMany({
          where: { id: { in: waitlistClassIds } },
          select: { id: true, classType: { select: { name: true } } },
        })
      : [];
    const idToTypeName = new Map(waitlistClasses.map((c) => [c.id, c.classType.name]));
    const classTypeToWaitlist = new Map<string, { waitlisted: number; classes: Set<string> }>();
    for (const w of waitlistEntries) {
      const typeName = idToTypeName.get(w.classId);
      if (!typeName) continue;
      const entry = classTypeToWaitlist.get(typeName) ?? { waitlisted: 0, classes: new Set() };
      entry.waitlisted += 1;
      entry.classes.add(w.classId);
      classTypeToWaitlist.set(typeName, entry);
    }
    const waitlistHotspots = Array.from(classTypeToWaitlist.entries())
      .map(([name, v]) => ({
        classType: name,
        waitlistedClasses: v.classes.size,
        totalWaitlisted: v.waitlisted,
      }))
      .sort((a, b) => b.totalWaitlisted - a.totalWaitlisted)
      .slice(0, 3);

    const response: InsightsResponse = {
      classTypeTop,
      classTypeBottom,
      coachTop,
      coachBottom,
      timeSlotTop,
      timeSlotBottom,
      mrrConcentration: {
        totalMrr,
        top10Share: totalMrr > 0 ? Math.round((top10Amount / totalMrr) * 100) : 0,
        topMembers: topContributors.map((sub) => ({
          name: sub.user.name ?? "Sin nombre",
          amount: sub.package.price,
          packageName: sub.package.name,
        })),
      },
      mrrAtRisk: {
        count: atRiskDetailed.length,
        exposedMrr,
        members: atRiskDetailed.slice(0, 5),
      },
      retentionCohorts,
      waitlistHotspots,
      meta: {
        range,
        classesAnalyzed: classes.length,
        activeSubscriptions: activeSubs.length,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Finance insights error:", error);
    return NextResponse.json(
      { error: "Failed to compute insights" },
      { status: 500 },
    );
  }
}
