import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../_auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { membershipId } = await params;

    const membership = await prisma.membership.findFirst({
      where: {
        id: membershipId,
        tenantId: ctx.tenant.id,
        role: { in: ["FRONT_DESK", "ADMIN"] },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true, phone: true },
        },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [payRates, commissionRules, activeShift] = await Promise.all([
      prisma.staffPayRate.findMany({
        where: { tenantId: ctx.tenant.id, userId: membership.userId },
        include: { studio: { select: { id: true, name: true } } },
        orderBy: [{ isActive: "desc" }, { effectiveFrom: "desc" }],
      }),
      prisma.staffCommissionRule.findMany({
        where: { tenantId: ctx.tenant.id, userId: membership.userId },
        include: {
          studio: { select: { id: true, name: true } },
          package: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
        },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      }),
      prisma.staffShift.findFirst({
        where: {
          tenantId: ctx.tenant.id,
          userId: membership.userId,
          status: "OPEN",
        },
        include: { studio: { select: { id: true, name: true } } },
      }),
    ]);

    return NextResponse.json({
      membership,
      payRates,
      commissionRules,
      activeShift,
    });
  } catch (error) {
    console.error("GET /api/admin/staff/[membershipId] error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
