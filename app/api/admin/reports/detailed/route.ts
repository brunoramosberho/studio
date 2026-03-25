import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const sp = request.nextUrl.searchParams;
    const now = new Date();

    const fromDate = sp.get("from")
      ? new Date(sp.get("from")!)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = sp.get("to")
      ? (() => {
          const d = new Date(sp.get("to")!);
          d.setHours(23, 59, 59, 999);
          return d;
        })()
      : now;

    fromDate.setHours(0, 0, 0, 0);

    const confirmedOrAttended = { in: ["CONFIRMED", "ATTENDED"] as ("CONFIRMED" | "ATTENDED")[] };

    const purchasesP = prisma.userPackage.findMany({
      where: {
        tenantId,
        purchasedAt: { gte: fromDate, lte: toDate },
      },
      include: { package: { select: { price: true } } },
    });

    const classesP = prisma.class.findMany({
      where: {
        tenantId,
        startsAt: { gte: fromDate, lte: toDate },
        status: { in: ["SCHEDULED", "COMPLETED"] },
      },
      include: {
        classType: { select: { name: true, color: true } },
        room: { select: { maxCapacity: true } },
        _count: {
          select: {
            bookings: { where: { status: confirmedOrAttended } },
          },
        },
        bookings: {
          where: { status: "ATTENDED" as const },
          select: { id: true },
        },
      },
    });

    const classTypesP = prisma.classType.findMany({
      where: { tenantId },
      select: { id: true, name: true, color: true },
    });

    const membershipsP = prisma.membership.findMany({
      where: { tenantId, role: "CLIENT" },
      select: { userId: true, createdAt: true },
    });

    const [purchases, classes, classTypes, memberships] = await Promise.all([
      purchasesP,
      classesP,
      classTypesP,
      membershipsP,
    ]);

    // -- Revenue chart: daily breakdown --
    const revenueByDay = new Map<string, number>();
    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const key = cursor.toISOString().slice(0, 10);
      revenueByDay.set(key, 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const p of purchases) {
      const key = new Date(p.purchasedAt).toISOString().slice(0, 10);
      revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + p.package.price);
    }
    const revenueChart = Array.from(revenueByDay.entries()).map(
      ([date, revenue]) => ({
        name: new Date(date).toLocaleDateString("es", {
          day: "numeric",
          month: "short",
        }),
        revenue,
      }),
    );

    // -- Attendance chart: weekly rate --
    const weekBuckets = new Map<
      string,
      { attended: number; total: number }
    >();
    for (const c of classes) {
      const weekStart = new Date(c.startsAt);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      const bucket = weekBuckets.get(key) ?? { attended: 0, total: 0 };
      bucket.total += c._count.bookings;
      bucket.attended += c.bookings.length;
      weekBuckets.set(key, bucket);
    }
    const attendanceChart = Array.from(weekBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { attended, total }]) => ({
        name: new Date(date).toLocaleDateString("es", {
          day: "numeric",
          month: "short",
        }),
        rate: total > 0 ? Math.round((attended / total) * 100) : 0,
      }));

    // -- Popular classes: bookings by class type --
    const typeCountMap = new Map<string, number>();
    for (const c of classes) {
      const name = c.classType.name;
      typeCountMap.set(name, (typeCountMap.get(name) ?? 0) + c._count.bookings);
    }
    const colorMap = new Map(classTypes.map((ct) => [ct.name, ct.color]));
    const popularClasses = Array.from(typeCountMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        color: colorMap.get(name) ?? "#C9A96E",
      }))
      .sort((a, b) => b.count - a.count);

    // -- Retention: cohort analysis --
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAttendees = await prisma.booking.findMany({
      where: {
        status: "ATTENDED",
        class: { tenantId, startsAt: { gte: thirtyDaysAgo } },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    const activeSet = new Set(recentAttendees.map((b) => b.userId));

    const cohorts = [
      { label: "0-30 días", minDays: 0, maxDays: 30 },
      { label: "31-60 días", minDays: 31, maxDays: 60 },
      { label: "61-90 días", minDays: 61, maxDays: 90 },
      { label: "91-180 días", minDays: 91, maxDays: 180 },
      { label: "180+ días", minDays: 181, maxDays: 9999 },
    ];

    const retention = cohorts.map(({ label, minDays, maxDays }) => {
      const cohortMembers = memberships.filter((m) => {
        const age = Math.floor(
          (now.getTime() - new Date(m.createdAt).getTime()) / 86400000,
        );
        return age >= minDays && age <= maxDays;
      });
      const total = cohortMembers.length;
      const active = cohortMembers.filter((m) =>
        activeSet.has(m.userId),
      ).length;
      return {
        month: label,
        rate: total > 0 ? Math.round((active / total) * 100) : 0,
        total,
        active,
      };
    });

    return NextResponse.json({
      revenueChart,
      attendanceChart,
      popularClasses,
      retention,
    });
  } catch (error) {
    console.error("GET /api/admin/reports/detailed error:", error);
    return NextResponse.json(
      { error: "Failed to generate detailed report" },
      { status: 500 },
    );
  }
}
