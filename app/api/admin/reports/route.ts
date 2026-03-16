import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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
        },
      }),

      prisma.booking.count({
        where: {
          createdAt: { gte: startOfWeek },
          status: { in: ["CONFIRMED", "ATTENDED"] },
        },
      }),

      prisma.userPackage.findMany({
        where: { purchasedAt: { gte: startOfWeek } },
        include: { package: { select: { price: true } } },
      }),

      prisma.user.count({
        where: {
          createdAt: { gte: startOfWeek },
          role: "CLIENT",
        },
      }),

      prisma.class.findMany({
        where: {
          startsAt: { gte: thirtyDaysAgo },
          status: { in: ["SCHEDULED", "COMPLETED"] },
        },
        include: {
          classType: { select: { maxCapacity: true } },
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
        const capacity = c.classType.maxCapacity;
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
