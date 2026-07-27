import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";

// Insights explorer: every metric as a time series over an arbitrary range,
// with an optional same-length previous period to compare against. One request
// returns everything — the page is a viewer, not an orchestrator.
//
// Conventions this must not regress:
//   - Occupancy counts FINISHED classes only (endsAt past, not cancelled).
//   - "Reservas" are app bookings (partner seats excluded); "Visitas" count
//     every attended seat, Wellhub included — a visit is a visit.
//   - Money is collected cash: succeeded Stripe + completed POS.

type Agg = "day" | "week";

interface Point {
  d: string; // bucket start, YYYY-MM-DD
  v: number;
}

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday-based week start. */
function startOfWeekUTC(d: Date): Date {
  const day = startOfDayUTC(d);
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow);
  return day;
}

function bucketStart(d: Date, agg: Agg): string {
  const b = agg === "week" ? startOfWeekUTC(d) : startOfDayUTC(d);
  return b.toISOString().slice(0, 10);
}

function buildBuckets(from: Date, to: Date, agg: Agg): string[] {
  const out: string[] = [];
  const cursor = agg === "week" ? startOfWeekUTC(from) : startOfDayUTC(from);
  while (cursor <= to) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + (agg === "week" ? 7 : 1));
  }
  return out;
}

class Series {
  private map = new Map<string, number>();
  constructor(private buckets: string[]) {
    for (const b of buckets) this.map.set(b, 0);
  }
  add(date: Date, value: number, agg: Agg) {
    const key = bucketStart(date, agg);
    if (this.map.has(key)) this.map.set(key, (this.map.get(key) ?? 0) + value);
  }
  points(): Point[] {
    return this.buckets.map((d) => ({ d, v: Math.round((this.map.get(d) ?? 0) * 100) / 100 }));
  }
  total(): number {
    let s = 0;
    for (const v of this.map.values()) s += v;
    return Math.round(s * 100) / 100;
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("analytics");
    const tenantId = ctx.tenant.id;

    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59.999Z`) : now;
    const from = sp.get("from")
      ? new Date(`${sp.get("from")}T00:00:00.000Z`)
      : new Date(now.getTime() - 29 * 86400_000);
    const agg: Agg = sp.get("agg") === "week" ? "week" : "day";
    const compare = sp.get("compare") !== "none";

    // Previous period: same length, ending right before `from`.
    const spanMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - spanMs);
    const queryFrom = compare ? prevFrom : from;

    const confirmedOrAttended = {
      status: { in: ["CONFIRMED", "ATTENDED"] as ("CONFIRMED" | "ATTENDED")[] },
    };

    const [
      stripePayments,
      posTransactions,
      appBookings,
      attendedVisits,
      finishedClasses,
      badBookings,
      newClients,
      newMemberRows,
      allSubs,
    ] = await Promise.all([
      prisma.stripePayment.findMany({
        where: { tenantId, status: "succeeded", createdAt: { gte: queryFrom, lte: to } },
        select: { createdAt: true, amount: true },
      }),
      prisma.posTransaction.findMany({
        where: { tenantId, status: "completed", createdAt: { gte: queryFrom, lte: to } },
        select: { createdAt: true, amount: true },
      }),
      prisma.booking.findMany({
        where: {
          tenantId,
          platformBookingId: null,
          createdAt: { gte: queryFrom, lte: to },
          status: { not: "CANCELLED" },
        },
        select: { createdAt: true },
      }),
      prisma.booking.findMany({
        where: {
          tenantId,
          status: "ATTENDED",
          class: { startsAt: { gte: queryFrom, lte: to } },
        },
        select: { userId: true, class: { select: { startsAt: true } } },
      }),
      prisma.class.findMany({
        where: {
          tenantId,
          startsAt: { gte: queryFrom, lte: to },
          endsAt: { lte: now },
          status: { not: "CANCELLED" },
        },
        select: {
          startsAt: true,
          room: { select: { maxCapacity: true } },
          _count: { select: { bookings: { where: confirmedOrAttended } } },
        },
      }),
      prisma.booking.findMany({
        where: {
          tenantId,
          status: { in: ["CANCELLED", "NO_SHOW"] },
          class: { startsAt: { gte: queryFrom, lte: to }, endsAt: { lte: now } },
        },
        select: { status: true, class: { select: { startsAt: true } } },
      }),
      prisma.membership.findMany({
        where: { tenantId, role: "CLIENT", createdAt: { gte: queryFrom, lte: to } },
        select: { createdAt: true },
      }),
      prisma.membership.findMany({
        where: { tenantId, firstPurchaseAt: { gte: queryFrom, lte: to } },
        select: { firstPurchaseAt: true },
      }),
      prisma.memberSubscription.findMany({
        where: { tenantId },
        select: { createdAt: true, canceledAt: true, status: true },
      }),
    ]);

    const windows: ["current", Date, Date][] = [["current", from, to]];
    if (compare) windows.push(["current", prevFrom, prevTo] as never);

    const build = (win: [Date, Date]) => {
      const [f, t] = win;
      const buckets = buildBuckets(f, t, agg);
      const inWin = (d: Date) => d >= f && d <= t;

      const revenue = new Series(buckets);
      for (const p of stripePayments) if (inWin(p.createdAt)) revenue.add(p.createdAt, p.amount, agg);
      for (const p of posTransactions) if (inWin(p.createdAt)) revenue.add(p.createdAt, p.amount, agg);

      const bookings = new Series(buckets);
      for (const b of appBookings) if (inWin(b.createdAt)) bookings.add(b.createdAt, 1, agg);

      const visits = new Series(buckets);
      const visitors = new Set<string>();
      let visitCount = 0;
      for (const v of attendedVisits) {
        if (!inWin(v.class.startsAt)) continue;
        visits.add(v.class.startsAt, 1, agg);
        visitCount++;
        if (v.userId) visitors.add(v.userId);
      }

      // Occupancy: per-bucket per-class average; the headline total is the
      // whole-window per-class average (not an average of bucket averages).
      const occRatio = new Series(buckets);
      const occCount = new Series(buckets);
      const classes = new Series(buckets);
      let ratioSum = 0;
      let classCount = 0;
      for (const c of finishedClasses) {
        if (!inWin(c.startsAt)) continue;
        classes.add(c.startsAt, 1, agg);
        const cap = c.room?.maxCapacity ?? 0;
        if (cap === 0) continue;
        const r = c._count.bookings / cap;
        occRatio.add(c.startsAt, r, agg);
        occCount.add(c.startsAt, 1, agg);
        ratioSum += r;
        classCount++;
      }
      const occPoints = occRatio.points().map((p, i) => {
        const n = occCount.points()[i].v;
        return { d: p.d, v: n > 0 ? Math.round((p.v / n) * 100) : 0 };
      });

      const cancellations = new Series(buckets);
      const noShows = new Series(buckets);
      for (const b of badBookings) {
        if (!inWin(b.class.startsAt)) continue;
        if (b.status === "CANCELLED") cancellations.add(b.class.startsAt, 1, agg);
        else noShows.add(b.class.startsAt, 1, agg);
      }

      const clients = new Series(buckets);
      for (const m of newClients) if (inWin(m.createdAt)) clients.add(m.createdAt, 1, agg);

      const members = new Series(buckets);
      for (const m of newMemberRows)
        if (m.firstPurchaseAt && inWin(m.firstPurchaseAt)) members.add(m.firstPurchaseAt, 1, agg);

      // Active subscriptions as of each bucket end (created before, not yet
      // cancelled). The headline is the latest bucket, not a sum.
      const activeSubsPoints: Point[] = buckets.map((b, i) => {
        const end =
          i + 1 < buckets.length
            ? new Date(`${buckets[i + 1]}T00:00:00.000Z`)
            : new Date(Math.min(t.getTime(), now.getTime()));
        const count = allSubs.filter(
          (s) => s.createdAt <= end && (!s.canceledAt || s.canceledAt > end),
        ).length;
        return { d: b, v: count };
      });

      return {
        revenue,
        bookings,
        visits,
        visitCount,
        visitors,
        occPoints,
        occTotal: classCount > 0 ? Math.round((ratioSum / classCount) * 100) : 0,
        classes,
        classCount,
        cancellations,
        noShows,
        clients,
        members,
        activeSubsPoints,
      };
    };

    const cur = build([from, to]);
    const prev = compare ? build([prevFrom, prevTo]) : null;

    // Retention: of the people who visited this period, who was here before?
    const visitorIds = [...cur.visitors];
    const returning = visitorIds.length
      ? await prisma.booking.findMany({
          where: {
            tenantId,
            status: "ATTENDED",
            userId: { in: visitorIds },
            class: { startsAt: { lt: from } },
          },
          select: { userId: true },
          distinct: ["userId"],
        })
      : [];
    const repeatCount = returning.length;
    const newVisitorCount = visitorIds.length - repeatCount;

    const metric = (
      key: keyof typeof cur,
      kind: "sum" | "occupancy" | "last" = "sum",
    ) => {
      if (kind === "occupancy") {
        return {
          total: cur.occTotal,
          prevTotal: prev?.occTotal ?? null,
          points: cur.occPoints,
        };
      }
      if (kind === "last") {
        const pts = cur.activeSubsPoints;
        return {
          total: pts.length ? pts[pts.length - 1].v : 0,
          prevTotal: prev?.activeSubsPoints.length
            ? prev.activeSubsPoints[prev.activeSubsPoints.length - 1].v
            : null,
          points: pts,
        };
      }
      const s = cur[key] as Series;
      const p = prev?.[key] as Series | undefined;
      return { total: s.total(), prevTotal: p ? p.total() : null, points: s.points() };
    };

    const totalClients = metric("clients");
    const totalMembers = metric("members");

    return NextResponse.json({
      range: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        prevFrom: compare ? prevFrom.toISOString().slice(0, 10) : null,
        prevTo: compare ? prevTo.toISOString().slice(0, 10) : null,
        agg,
      },
      metrics: {
        revenue: metric("revenue"),
        bookings: metric("bookings"),
        visits: metric("visits"),
        occupancy: metric("occPoints", "occupancy"),
        classes: metric("classes"),
        cancellations: metric("cancellations"),
        noShows: metric("noShows"),
        newClients: totalClients,
        newMembers: totalMembers,
        activeSubscriptions: metric("activeSubsPoints", "last"),
      },
      retention: { repeat: repeatCount, new: newVisitorCount },
      glance: {
        visits: cur.visitCount,
        uniqueCustomers: cur.visitors.size,
        avgVisitsPerCustomer:
          cur.visitors.size > 0
            ? Math.round((cur.visitCount / cur.visitors.size) * 10) / 10
            : 0,
        classes: cur.classCount,
        cancellations: (cur.cancellations as Series).total(),
        noShows: (cur.noShows as Series).total(),
        capacityFilled: cur.occTotal,
        conversionToMembership:
          totalClients.total > 0
            ? Math.round((totalMembers.total / totalClients.total) * 100)
            : null,
      },
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/admin/insights error:", error);
    return NextResponse.json({ error: "Failed to load insights" }, { status: 500 });
  }
}
