// Admin probe to confirm:
//   1. WELLHUB_AUTH_TOKEN works (health endpoint returns "ok").
//   2. The gym_id configured on this tenant is in the CMS's list of gyms.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  bookingHealth,
  listIntegratedGyms,
  WellhubApiError,
  WellhubConfigError,
} from "@/lib/platforms/wellhub";

export async function POST() {
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

    try {
      await bookingHealth();
    } catch (error) {
      if (error instanceof WellhubConfigError) {
        return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 500 });
      }
      if (error instanceof WellhubApiError) {
        return NextResponse.json({
          ok: false,
          reason: "health_failed",
          status: error.status,
        }, { status: 502 });
      }
      throw error;
    }

    const gyms = await listIntegratedGyms();
    const match = gyms.find((g) => g.id === config.wellhubGymId);
    if (!match) {
      return NextResponse.json({
        ok: false,
        reason: "gym_not_in_cms",
        gym_id: config.wellhubGymId,
      }, { status: 404 });
    }

    return NextResponse.json({ ok: true, gym: match });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/wellhub/test-connection error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
