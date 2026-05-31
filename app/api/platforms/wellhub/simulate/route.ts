// Admin-only proxy to Wellhub's sandbox webhook simulation endpoints.
// Lets us trigger real webhooks against our own endpoint end-to-end without
// needing a Wellhub member to make a real booking. Sandbox only.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  getWellhubTokenForTenant,
  simulateBookingCancel,
  simulateBookingRequested,
  simulateCheckin,
  WellhubApiError,
  WellhubConfigError,
} from "@/lib/platforms/wellhub";

type SimulateBody =
  | {
      action: "booking-requested";
      slotId: number;
      classId: number;
      gympassUserId: string;
    }
  | {
      action: "booking-cancel";
      bookingNumber: string;
      late?: boolean;
    }
  | {
      action: "checkin";
      gympassUserId: string;
    };

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      select: { wellhubGymId: true },
    });
    if (!config?.wellhubGymId) {
      return NextResponse.json(
        { ok: false, reason: "missing_gym_id" },
        { status: 400 },
      );
    }

    const token = await getWellhubTokenForTenant(tenant.id);
    const body = (await request.json()) as SimulateBody;

    let result: unknown;
    switch (body.action) {
      case "booking-requested":
        result = await simulateBookingRequested({
          gymId: config.wellhubGymId,
          slotId: body.slotId,
          classId: body.classId,
          gympassUserId: body.gympassUserId,
          token,
        });
        break;
      case "booking-cancel":
        result = await simulateBookingCancel({
          gymId: config.wellhubGymId,
          bookingNumber: body.bookingNumber,
          late: body.late,
          token,
        });
        break;
      case "checkin":
        result = await simulateCheckin({
          gymId: config.wellhubGymId,
          gympassUserId: body.gympassUserId,
          token,
        });
        break;
      default:
        return NextResponse.json({ ok: false, reason: "invalid_action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof WellhubConfigError) {
      return NextResponse.json({ ok: false, reason: "config_error", message: error.message }, { status: 400 });
    }
    if (error instanceof WellhubApiError) {
      return NextResponse.json(
        { ok: false, reason: "wellhub_api_error", status: error.status, body: error.body },
        { status: 502 },
      );
    }
    console.error("POST /api/platforms/wellhub/simulate error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
