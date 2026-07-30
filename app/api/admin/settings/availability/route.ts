import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { normalizeSlotTimes } from "@/lib/schedule/slots";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    return NextResponse.json({
      zoneRedDays: tenant.zoneRedDays,
      zoneYellowDays: tenant.zoneYellowDays,
      studioOpenTime: tenant.studioOpenTime,
      studioCloseTime: tenant.studioCloseTime,
      operatingDays: tenant.operatingDays,
      scheduleSlotTimes: tenant.scheduleSlotTimes,
      schedulePlannerRules: tenant.schedulePlannerRules,
      notifications: {
        emailOnRequest: tenant.notifyEmailOnRequest,
        pushOnRequest: tenant.notifyPushOnRequest,
        gapDetected: tenant.notifyGapDetected,
        weeklySummary: tenant.notifyWeeklySummary,
        autoRejectTimeout: tenant.notifyAutoRejectTimeout,
        coachClassReminder: tenant.notifyCoachClassReminder,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/settings/availability error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();

    const data: Record<string, unknown> = {};

    if (body.zoneRedDays !== undefined) {
      const val = Number(body.zoneRedDays);
      if (val < 1 || val > 90)
        return NextResponse.json(
          { error: "zoneRedDays must be 1–90" },
          { status: 400 },
        );
      data.zoneRedDays = val;
    }
    if (body.zoneYellowDays !== undefined) {
      const val = Number(body.zoneYellowDays);
      if (val < 1 || val > 180)
        return NextResponse.json(
          { error: "zoneYellowDays must be 1–180" },
          { status: 400 },
        );
      data.zoneYellowDays = val;
    }
    if (body.studioOpenTime !== undefined) data.studioOpenTime = body.studioOpenTime;
    if (body.studioCloseTime !== undefined) data.studioCloseTime = body.studioCloseTime;
    if (body.operatingDays !== undefined) data.operatingDays = body.operatingDays;
    if (body.schedulePlannerRules !== undefined) {
      const raw = body.schedulePlannerRules;
      if (raw !== null && typeof raw !== "string") {
        return NextResponse.json(
          { error: "schedulePlannerRules must be a string or null" },
          { status: 400 },
        );
      }
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (trimmed.length > 4000) {
        return NextResponse.json(
          { error: "schedulePlannerRules must be 4000 characters or fewer" },
          { status: 400 },
        );
      }
      data.schedulePlannerRules = trimmed.length > 0 ? trimmed : null;
    }
    if (body.scheduleSlotTimes !== undefined) {
      // [] is meaningful: it resets the grid to one row per hour.
      const slots = normalizeSlotTimes(body.scheduleSlotTimes);
      if (slots === null) {
        return NextResponse.json(
          { error: "scheduleSlotTimes must be unique HH:MM values (max 48)" },
          { status: 400 },
        );
      }
      data.scheduleSlotTimes = slots;
    }

    if (body.notifications) {
      const n = body.notifications;
      if (n.emailOnRequest !== undefined) data.notifyEmailOnRequest = n.emailOnRequest;
      if (n.pushOnRequest !== undefined) data.notifyPushOnRequest = n.pushOnRequest;
      if (n.gapDetected !== undefined) data.notifyGapDetected = n.gapDetected;
      if (n.weeklySummary !== undefined) data.notifyWeeklySummary = n.weeklySummary;
      if (n.autoRejectTimeout !== undefined) data.notifyAutoRejectTimeout = n.autoRejectTimeout;
      if (n.coachClassReminder !== undefined) data.notifyCoachClassReminder = n.coachClassReminder;
    }

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data,
    });

    return NextResponse.json({
      zoneRedDays: updated.zoneRedDays,
      zoneYellowDays: updated.zoneYellowDays,
      studioOpenTime: updated.studioOpenTime,
      studioCloseTime: updated.studioCloseTime,
      operatingDays: updated.operatingDays,
      scheduleSlotTimes: updated.scheduleSlotTimes,
      schedulePlannerRules: updated.schedulePlannerRules,
      notifications: {
        emailOnRequest: updated.notifyEmailOnRequest,
        pushOnRequest: updated.notifyPushOnRequest,
        gapDetected: updated.notifyGapDetected,
        weeklySummary: updated.notifyWeeklySummary,
        autoRejectTimeout: updated.notifyAutoRejectTimeout,
        coachClassReminder: updated.notifyCoachClassReminder,
      },
    });
  } catch (error) {
    console.error("PATCH /api/admin/settings/availability error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
