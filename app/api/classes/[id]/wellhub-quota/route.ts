// Lightweight status for the class editor's Wellhub quota control.
// Returns whether Wellhub is active (api mode), the tenant default, and this
// class's override (if any). The modal only shows the field when enabled.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "COACH");
    const { id } = await params;

    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId: ctx.tenant.id, platform: "wellhub" },
      select: { wellhubMode: true, wellhubDefaultQuota: true },
    });

    const enabled = config?.wellhubMode === "api";
    if (!enabled) {
      return NextResponse.json({ enabled: false });
    }

    const quota = await prisma.schedulePlatformQuota.findUnique({
      where: { classId_platform: { classId: id, platform: "wellhub" } },
      select: { quotaSpots: true, isClosedManually: true },
    });

    // override: null = follows default; "closed" = excluded; number = explicit.
    let override: number | "closed" | null = null;
    if (quota) override = quota.isClosedManually ? "closed" : quota.quotaSpots;

    return NextResponse.json({
      enabled: true,
      defaultQuota: config?.wellhubDefaultQuota ?? null,
      override,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/classes/[id]/wellhub-quota error:", error);
    return NextResponse.json({ enabled: false }, { status: 500 });
  }
}
