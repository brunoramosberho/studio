import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

export async function GET() {
  try {
    await requireSuperAdmin();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalTenants,
      totalUsers,
      activeMemberships,
      bookingsThisMonth,
      revenueResult,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.membership.count(),
      prisma.booking.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.userPackage.aggregate({
        where: { purchasedAt: { gte: startOfMonth } },
        _sum: { creditsTotal: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      totalTenants,
      totalUsers,
      activeMemberships,
      bookingsThisMonth,
      revenueThisMonth: revenueResult._count,
      packagesSoldThisMonth: revenueResult._count,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
