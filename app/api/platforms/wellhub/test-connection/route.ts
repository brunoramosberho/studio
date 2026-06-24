// Admin probe to confirm the configured Wellhub credentials actually work.
//
// We verify against an AUTHENTICATED endpoint (`GET /booking/v1/gyms/{gym_id}/
// classes`) — not the public health endpoint — so a green result means the
// token is valid AND authorized for this specific gym. A 401 here almost
// always means Wellhub hasn't finished enabling the gym for these credentials
// yet (their setup is async), which we surface distinctly so the admin knows
// to wait rather than thinking the token is wrong.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  getWellhubTokenForTenant,
  verifyGymAccess,
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
      return NextResponse.json({ ok: false, reason: "missing_gym_id" }, { status: 400 });
    }

    let token: string;
    try {
      token = await getWellhubTokenForTenant(tenant.id);
    } catch (error) {
      if (error instanceof WellhubConfigError) {
        return NextResponse.json({ ok: false, reason: "missing_token" }, { status: 400 });
      }
      throw error;
    }

    try {
      await verifyGymAccess(config.wellhubGymId, token);
    } catch (error) {
      if (error instanceof WellhubApiError) {
        // 401/403 → token not (yet) authorized for this gym. Most common cause
        // is Wellhub still provisioning gym access for the credentials.
        if (error.status === 401 || error.status === 403) {
          return NextResponse.json(
            {
              ok: false,
              reason: "gym_not_authorized",
              status: error.status,
              hint: "El token es válido pero aún no tiene acceso a este gym. Suele significar que Wellhub no terminó de habilitar el gym para estas credenciales — vuelve a probar más tarde o confírmalo con tu contacto.",
            },
            { status: 200 },
          );
        }
        // 404 → gym id likely wrong.
        if (error.status === 404) {
          return NextResponse.json(
            { ok: false, reason: "gym_not_found", status: 404 },
            { status: 200 },
          );
        }
        return NextResponse.json(
          { ok: false, reason: "wellhub_error", status: error.status },
          { status: 200 },
        );
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
