import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "./_auth";

// Lists every staff member (FRONT_DESK or ADMIN) for this tenant alongside
// their active shift (if any) and aggregate hours/comissions for the current
// month. Drives the /admin/staff index.
export async function GET() {
  try {
    const ctx = await requireStaffManagement();

    const memberships = await prisma.membership.findMany({
      where: {
        tenantId: ctx.tenant.id,
        role: { in: ["FRONT_DESK", "ADMIN"] },
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (memberships.length === 0) {
      return NextResponse.json({ staff: [] });
    }

    const userIds = memberships.map((m) => m.userId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [openShifts, monthShifts, monthCommissions] = await Promise.all([
      prisma.staffShift.findMany({
        where: { tenantId: ctx.tenant.id, userId: { in: userIds }, status: "OPEN" },
        include: { studio: { select: { id: true, name: true } } },
      }),
      prisma.staffShift.groupBy({
        by: ["userId"],
        where: {
          tenantId: ctx.tenant.id,
          userId: { in: userIds },
          status: { in: ["CLOSED", "AUTO_CLOSED", "EDITED"] },
          clockInAt: { gte: monthStart },
        },
        _sum: { durationMinutes: true },
      }),
      prisma.staffCommissionEarning.groupBy({
        by: ["userId"],
        where: {
          tenantId: ctx.tenant.id,
          userId: { in: userIds },
          status: { in: ["EARNED", "PAID"] },
          occurredAt: { gte: monthStart },
        },
        _sum: { commissionAmountCents: true },
      }),
    ]);

    const openByUser = new Map(openShifts.map((s) => [s.userId, s] as const));
    const minutesByUser = new Map(monthShifts.map((s) => [s.userId, s._sum.durationMinutes ?? 0] as const));
    const commByUser = new Map(monthCommissions.map((s) => [s.userId, s._sum.commissionAmountCents ?? 0] as const));

    const staff = memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      role: m.role,
      user: m.user,
      activeShift: openByUser.get(m.userId)
        ? {
            id: openByUser.get(m.userId)!.id,
            studio: openByUser.get(m.userId)!.studio,
            clockInAt: openByUser.get(m.userId)!.clockInAt,
          }
        : null,
      monthHours: Number(((minutesByUser.get(m.userId) ?? 0) / 60).toFixed(2)),
      monthCommissionCents: commByUser.get(m.userId) ?? 0,
    }));

    return NextResponse.json({ staff });
  } catch (error) {
    console.error("GET /api/admin/staff error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
