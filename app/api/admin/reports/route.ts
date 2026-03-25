import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const [
      bookingsToday,
      bookingsThisWeek,
      weeklyPurchases,
      newClientsThisWeek,
      classesThisMonth,
      popularType,
    ] = await Promise.all([
      prisma.booking.count({
        where: {
          createdAt: { gte: startOfToday, lte: endOfToday },
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { tenantId },
        },
      }),

      prisma.booking.count({
        where: {
          createdAt: { gte: startOfWeek },
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { tenantId },
        },
      }),

      prisma.userPackage.findMany({
        where: { purchasedAt: { gte: startOfWeek }, tenantId },
        include: { package: { select: { price: true } } },
      }),

      prisma.membership.count({
        where: {
          createdAt: { gte: startOfWeek },
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
            select: { bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } } },
          },
        },
      }),

      prisma.booking.groupBy({
        by: ["classId"],
        where: {
          createdAt: { gte: thirtyDaysAgo },
          status: { in: ["CONFIRMED", "ATTENDED"] },
          class: { tenantId },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 1,
      }),
    ]);

    const revenueThisWeek = weeklyPurchases.reduce(
      (sum, up) => sum + up.package.price,
      0,
    );

    let avgOccupancy = 0;
    if (classesThisMonth.length > 0) {
      const totalOccupancy = classesThisMonth.reduce((sum, c) => {
        const capacity = c.room.maxCapacity;
        if (capacity === 0) return sum;
        return sum + c._count.bookings / capacity;
      }, 0);
      avgOccupancy = Math.round((totalOccupancy / classesThisMonth.length) * 100);
    }

    let popularClassType = "N/A";
    if (popularType.length > 0) {
      const topClass = await prisma.class.findFirst({
        where: { id: popularType[0].classId },
        include: { classType: { select: { name: true } } },
      });
      popularClassType = topClass?.classType.name ?? "N/A";
    }

    return NextResponse.json({
      bookingsToday,
      bookingsThisWeek,
      revenueThisWeek,
      avgOccupancy,
      newClientsThisWeek,
      popularClassType,
    });
  } catch (error) {
    console.error("GET /api/admin/reports error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 },
    );
  }
}
