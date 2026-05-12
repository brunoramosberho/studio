import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const { tenant, session } = await requireRole("ADMIN");
    const { classId } = await params;
    const body = await request.json();
    const { platform } = body as { platform: PlatformType };

    if (!platform || !["classpass", "wellhub"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const quota = await prisma.schedulePlatformQuota.findFirst({
      where: { classId, platform, tenantId: tenant.id },
    });

    if (!quota) {
      return NextResponse.json({ error: "Quota not found" }, { status: 404 });
    }

    const updated = await prisma.schedulePlatformQuota.update({
      where: { id: quota.id },
      data: {
        isClosedManually: true,
        closedAt: new Date(),
        closedBy: session.user.id,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/quotas/[classId]/close error:", error);
    return NextResponse.json({ error: "Failed to close quota" }, { status: 500 });
  }
}
