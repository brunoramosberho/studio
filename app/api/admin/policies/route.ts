import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireTenant } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import {
  computeVisibleUntil,
  getVisibleUntilForUser,
  resolveScheduleTimezone,
} from "@/lib/schedule/visibility";

/**
 * GET /api/admin/policies
 * Returns cancellation & no-show policy config for the current tenant.
 * Accessible by any authenticated user (so frontend can apply the policy).
 */
export async function GET() {
  try {
    const tenant = await requireTenant();
    const timezone = await resolveScheduleTimezone(tenant);
    // Personalise the visible horizon for a logged-in member: packages they hold
    // (with remaining credits) can extend it past the tenant default. Anonymous
    // visitors and the embed get the plain default (which is also what Wellhub
    // sees). Any auth hiccup falls back to the default.
    const session = await auth().catch(() => null);
    const visibleUntilIso = (
      await getVisibleUntilForUser(new Date(), tenant, timezone, session?.user?.id ?? null)
    ).toISOString();

    return NextResponse.json({
      cancellationWindowHours: tenant.cancellationWindowHours,
      noShowPenaltyEnabled: tenant.noShowPenaltyEnabled,
      noShowLoseCredit: tenant.noShowLoseCredit,
      noShowChargeFee: tenant.noShowChargeFee,
      noShowPenaltyAmount: tenant.noShowPenaltyAmount,
      noShowFeeAmountUnlimited: tenant.noShowFeeAmountUnlimited,
      noShowPenaltyGraceHours: tenant.noShowPenaltyGraceHours,
      scheduleVisibilityMode: tenant.scheduleVisibilityMode,
      visibleScheduleDays: tenant.visibleScheduleDays,
      scheduleReleaseDayOfWeek: tenant.scheduleReleaseDayOfWeek,
      scheduleReleaseHour: tenant.scheduleReleaseHour,
      scheduleReleaseWeeksAhead: tenant.scheduleReleaseWeeksAhead,
      scheduleReleaseTimezone: tenant.scheduleReleaseTimezone,
      scheduleEffectiveTimezone: timezone,
      visibleUntilIso,
      hideCoachUntilClassEnds: tenant.hideCoachUntilClassEnds,
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
      scheduleVisibilityMode: "ROLLING_DAYS",
      visibleScheduleDays: 7,
      scheduleReleaseDayOfWeek: null,
      scheduleReleaseHour: null,
      scheduleReleaseWeeksAhead: null,
      scheduleReleaseTimezone: null,
      scheduleEffectiveTimezone: "Europe/Madrid",
      visibleUntilIso: null,
      hideCoachUntilClassEnds: false,
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
      scheduleVisibilityMode,
      visibleScheduleDays,
      scheduleReleaseDayOfWeek,
      scheduleReleaseHour,
      scheduleReleaseWeeksAhead,
      scheduleReleaseTimezone,
      hideCoachUntilClassEnds,
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

    if (scheduleVisibilityMode !== undefined) {
      if (scheduleVisibilityMode !== "ROLLING_DAYS" && scheduleVisibilityMode !== "WEEKLY_RELEASE") {
        return NextResponse.json(
          { error: "Invalid scheduleVisibilityMode" },
          { status: 400 },
        );
      }
      data.scheduleVisibilityMode = scheduleVisibilityMode;
    }

    if (visibleScheduleDays !== undefined) {
      const days = Math.max(1, Math.min(60, Math.round(Number(visibleScheduleDays))));
      data.visibleScheduleDays = days;
    }

    if (scheduleReleaseDayOfWeek !== undefined) {
      data.scheduleReleaseDayOfWeek =
        scheduleReleaseDayOfWeek === null
          ? null
          : Math.max(0, Math.min(6, Math.round(Number(scheduleReleaseDayOfWeek))));
    }

    if (scheduleReleaseHour !== undefined) {
      data.scheduleReleaseHour =
        scheduleReleaseHour === null
          ? null
          : Math.max(0, Math.min(23, Math.round(Number(scheduleReleaseHour))));
    }

    if (scheduleReleaseWeeksAhead !== undefined) {
      data.scheduleReleaseWeeksAhead =
        scheduleReleaseWeeksAhead === null
          ? null
          : Math.max(1, Math.min(8, Math.round(Number(scheduleReleaseWeeksAhead))));
    }

    if (scheduleReleaseTimezone !== undefined) {
      data.scheduleReleaseTimezone =
        scheduleReleaseTimezone === null || scheduleReleaseTimezone === ""
          ? null
          : String(scheduleReleaseTimezone);
    }

    // If switching to WEEKLY_RELEASE without the required fields, reject so the
    // tenant doesn't silently fall back to rolling.
    const targetMode =
      (data.scheduleVisibilityMode as string | undefined) ?? ctx.tenant.scheduleVisibilityMode;
    if (targetMode === "WEEKLY_RELEASE") {
      const dow = data.scheduleReleaseDayOfWeek ?? ctx.tenant.scheduleReleaseDayOfWeek;
      const hour = data.scheduleReleaseHour ?? ctx.tenant.scheduleReleaseHour;
      const wks = data.scheduleReleaseWeeksAhead ?? ctx.tenant.scheduleReleaseWeeksAhead;
      if (dow == null || hour == null || wks == null) {
        return NextResponse.json(
          {
            error:
              "Weekly release mode requires scheduleReleaseDayOfWeek, scheduleReleaseHour and scheduleReleaseWeeksAhead",
          },
          { status: 400 },
        );
      }
    }

    if (hideCoachUntilClassEnds !== undefined) {
      data.hideCoachUntilClassEnds = Boolean(hideCoachUntilClassEnds);
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
        scheduleVisibilityMode: true,
        visibleScheduleDays: true,
        scheduleReleaseDayOfWeek: true,
        scheduleReleaseHour: true,
        scheduleReleaseWeeksAhead: true,
        scheduleReleaseTimezone: true,
        hideCoachUntilClassEnds: true,
      },
    });

    const timezone = await resolveScheduleTimezone({
      id: ctx.tenant.id,
      scheduleReleaseTimezone: updated.scheduleReleaseTimezone,
    });
    const visibleUntilIso = computeVisibleUntil(
      new Date(),
      {
        scheduleVisibilityMode: updated.scheduleVisibilityMode,
        visibleScheduleDays: updated.visibleScheduleDays,
        scheduleReleaseDayOfWeek: updated.scheduleReleaseDayOfWeek,
        scheduleReleaseHour: updated.scheduleReleaseHour,
        scheduleReleaseWeeksAhead: updated.scheduleReleaseWeeksAhead,
        scheduleReleaseTimezone: updated.scheduleReleaseTimezone,
      },
      timezone,
    ).toISOString();

    return NextResponse.json({
      ...updated,
      scheduleEffectiveTimezone: timezone,
      visibleUntilIso,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("POST /api/admin/policies error:", error);
    return NextResponse.json({ error: "Failed to update policies" }, { status: 500 });
  }
}
