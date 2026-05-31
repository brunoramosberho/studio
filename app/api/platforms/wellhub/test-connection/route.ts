// Admin probe to confirm the configured Wellhub credentials work.
//
// Today this only calls the booking health endpoint (which returns "ok" for
// any valid bearer token). In Task 3 this will be upgraded to call
// `GET /booking/v1/gyms/{gym_id}/classes` using the per-tenant token so we
// verify both the token AND that the tenant's gym_id is reachable.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  bookingHealth,
  getWellhubTokenForTenant,
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
      const token = await getWellhubTokenForTenant(tenant.id);
      await bookingHealth(token);
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

    return NextResponse.json({ ok: true, gym_id: config.wellhubGymId });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/wellhub/test-connection error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
