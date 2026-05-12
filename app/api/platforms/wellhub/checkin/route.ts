// Coach-facing "Attendance Trigger" endpoint. The coach enters either:
//   - `gympassId` (13 digits, shown in the user's Wellhub app), or
//   - `customCode` (RFID/PIN/QR previously associated with the member).
//
// We call POST /access/v1/validate. On the first visit the coach must use
// gympassId; afterwards the custom_code is auto-associated and works offline.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  WellhubApiError,
  validateWellhubCheckin,
  createWellhubCustomCode,
} from "@/lib/platforms/wellhub";

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK", "COACH");
    const body = await request.json();
    const { gympassId, customCode } = body as {
      gympassId?: string;
      customCode?: string;
    };

    if (!gympassId && !customCode) {
      return NextResponse.json({ error: "gympassId or customCode required" }, { status: 400 });
    }

    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      select: { wellhubGymId: true },
    });
    if (!config?.wellhubGymId) {
      return NextResponse.json({ error: "Wellhub not configured" }, { status: 400 });
    }

    // Resolve wellhubId from customCode if necessary.
    let wellhubId = gympassId;
    if (!wellhubId && customCode) {
      const link = await prisma.wellhubUserLink.findFirst({
        where: { tenantId: tenant.id, customCode },
        select: { wellhubUniqueToken: true },
      });
      if (!link) {
        return NextResponse.json({
          ok: false,
          reason: "unknown_custom_code",
        }, { status: 404 });
      }
      wellhubId = link.wellhubUniqueToken;
    }

    try {
      const result = await validateWellhubCheckin({
        gymId: config.wellhubGymId,
        wellhubId: wellhubId!,
        customCode,
      });

      // On first visit, persist the customCode mapping so future visits can
      // resolve offline.
      if (customCode && gympassId) {
        await prisma.wellhubUserLink.upsert({
          where: {
            tenantId_wellhubUniqueToken: {
              tenantId: tenant.id,
              wellhubUniqueToken: gympassId,
            },
          },
          create: {
            tenantId: tenant.id,
            wellhubUniqueToken: gympassId,
            customCode,
            lastValidatedAt: new Date(),
          },
          update: { customCode, lastValidatedAt: new Date() },
        });
        // Best effort: tell Wellhub about the custom code for next time.
        try {
          await createWellhubCustomCode({
            gymId: config.wellhubGymId,
            wellhubId: gympassId,
            customCode,
          });
        } catch (codeError) {
          if (!(codeError instanceof WellhubApiError) || !codeError.isConflict) {
            console.warn("[wellhub] custom code persist failed", codeError);
          }
        }
      }

      return NextResponse.json({ ok: true, result });
    } catch (error) {
      if (error instanceof WellhubApiError) {
        return NextResponse.json({
          ok: false,
          reason: "wellhub_rejected",
          status: error.status,
          body: error.body,
        }, { status: error.status });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/wellhub/checkin error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
