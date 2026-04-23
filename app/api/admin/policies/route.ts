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
      noShowLoseCredit: tenant.noShowLoseCredit,
      noShowChargeFee: tenant.noShowChargeFee,
      noShowPenaltyAmount: tenant.noShowPenaltyAmount,
      noShowFeeAmountUnlimited: tenant.noShowFeeAmountUnlimited,
      noShowPenaltyGraceHours: tenant.noShowPenaltyGraceHours,
      visibleScheduleDays: tenant.visibleScheduleDays,
    });
  } catch {
    return NextResponse.json({
      cancellationWindowHours: 12,
      noShowPenaltyEnabled: false,
      noShowLoseCredit: true,
      noShowChargeFee: false,
      noShowPenaltyAmount: null,
      noShowFeeAmountUnlimited: null,
      noShowPenaltyGraceHours: 24,
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
    const {
      cancellationWindowHours,
      noShowPenaltyEnabled,
      noShowLoseCredit,
      noShowChargeFee,
      noShowPenaltyAmount,
      noShowFeeAmountUnlimited,
      noShowPenaltyGraceHours,
      visibleScheduleDays,
    } = body;

    const data: Record<string, unknown> = {};

    if (cancellationWindowHours !== undefined) {
      const hours = Math.max(0, Math.min(72, Math.round(Number(cancellationWindowHours))));
      data.cancellationWindowHours = hours;
    }

    if (noShowPenaltyEnabled !== undefined) {
      data.noShowPenaltyEnabled = Boolean(noShowPenaltyEnabled);
    }

    if (noShowLoseCredit !== undefined) {
      data.noShowLoseCredit = Boolean(noShowLoseCredit);
    }

    if (noShowChargeFee !== undefined) {
      data.noShowChargeFee = Boolean(noShowChargeFee);
    }

    if (noShowPenaltyAmount !== undefined) {
      data.noShowPenaltyAmount =
        noShowPenaltyAmount === null ? null : Math.max(0, Number(noShowPenaltyAmount));
    }

    if (noShowFeeAmountUnlimited !== undefined) {
      data.noShowFeeAmountUnlimited =
        noShowFeeAmountUnlimited === null ? null : Math.max(0, Number(noShowFeeAmountUnlimited));
    }

    if (noShowPenaltyGraceHours !== undefined) {
      const grace = Math.max(0, Math.min(168, Math.round(Number(noShowPenaltyGraceHours))));
      data.noShowPenaltyGraceHours = grace;
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
        noShowLoseCredit: true,
        noShowChargeFee: true,
        noShowPenaltyAmount: true,
        noShowFeeAmountUnlimited: true,
        noShowPenaltyGraceHours: true,
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
