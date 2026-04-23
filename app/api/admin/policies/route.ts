import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireTenant } from "@/lib/tenant";

/**
 * GET /api/admin/policies
 * Returns cancellation & no-show policy config for the current tenant.
 * Accessible by any authenticated user (so frontend can apply the policy).
 */
export async function GET() {
  try {
    const tenant = await requireTenant();

    return NextResponse.json({
      cancellationWindowHours: tenant.cancellationWindowHours,
      noShowPenaltyEnabled: tenant.noShowPenaltyEnabled,
      noShowPenaltyType: tenant.noShowPenaltyType,
      noShowPenaltyAmount: tenant.noShowPenaltyAmount,
      visibleScheduleDays: tenant.visibleScheduleDays,
    });
  } catch {
    // Default values for unauthenticated or error cases
    return NextResponse.json({
      cancellationWindowHours: 12,
      noShowPenaltyEnabled: false,
      noShowPenaltyType: "CREDIT_LOSS",
      noShowPenaltyAmount: null,
      visibleScheduleDays: 7,
    });
  }
}

/**
 * POST /api/admin/policies
 * Update cancellation & no-show policy. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    const body = await request.json();
    const { cancellationWindowHours, noShowPenaltyEnabled, noShowPenaltyType, noShowPenaltyAmount, visibleScheduleDays } = body;

    const data: Record<string, unknown> = {};

    if (cancellationWindowHours !== undefined) {
      const hours = Math.max(0, Math.min(72, Math.round(Number(cancellationWindowHours))));
      data.cancellationWindowHours = hours;
    }

    if (noShowPenaltyEnabled !== undefined) {
      data.noShowPenaltyEnabled = Boolean(noShowPenaltyEnabled);
    }

    if (noShowPenaltyType !== undefined) {
      if (!["CREDIT_LOSS", "FEE"].includes(noShowPenaltyType)) {
        return NextResponse.json(
          { error: "Invalid noShowPenaltyType. Must be CREDIT_LOSS or FEE" },
          { status: 400 },
        );
      }
      data.noShowPenaltyType = noShowPenaltyType;
    }

    if (noShowPenaltyAmount !== undefined) {
      data.noShowPenaltyAmount = noShowPenaltyAmount === null ? null : Math.max(0, Number(noShowPenaltyAmount));
    }

    if (visibleScheduleDays !== undefined) {
      const days = Math.max(1, Math.min(60, Math.round(Number(visibleScheduleDays))));
      data.visibleScheduleDays = days;
    }

    const updated = await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data,
      select: {
        cancellationWindowHours: true,
        noShowPenaltyEnabled: true,
        noShowPenaltyType: true,
        noShowPenaltyAmount: true,
        visibleScheduleDays: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/admin/policies error:", error);
    return NextResponse.json({ error: "Failed to update policies" }, { status: 500 });
  }
}
