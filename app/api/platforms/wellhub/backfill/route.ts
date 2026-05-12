// Push the next N days of Magic classes to Wellhub. Called from the admin
// setup page after onboarding so existing schedule appears in Wellhub without
// waiting for each class to be edited.
//
// We sync sequentially to keep the Wellhub call rate well under their 10k
// req/s budget and to surface per-class errors clearly.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { syncClassToWellhub } from "@/lib/platforms/wellhub";

const DEFAULT_DAYS = 28;
const MAX_DAYS = 90;
const MAX_CLASSES = 500;

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, Math.min(MAX_DAYS, Number(searchParams.get("days") ?? DEFAULT_DAYS)));

    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      select: { wellhubGymId: true, wellhubMode: true },
    });
    if (!config?.wellhubGymId) {
      return NextResponse.json({ ok: false, reason: "missing_gym_id" }, { status: 400 });
    }
    if (config.wellhubMode !== "api") {
      return NextResponse.json({ ok: false, reason: "wellhub_mode_not_api" }, { status: 400 });
    }

    const from = new Date();
    const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

    const classes = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: from, lte: to },
        status: "SCHEDULED",
      },
      orderBy: { startsAt: "asc" },
      take: MAX_CLASSES,
      select: { id: true },
    });

    const results = {
      total: classes.length,
      synced: 0,
      excluded: 0,
      errors: 0,
      skipped: 0,
    };

    for (const cls of classes) {
      const r = await syncClassToWellhub(cls.id);
      if (r.status === "synced") results.synced++;
      else if (r.status === "excluded") results.excluded++;
      else if (r.status === "error") results.errors++;
      else results.skipped++;
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/wellhub/backfill error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
