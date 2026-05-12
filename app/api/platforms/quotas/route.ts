import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);
    const weekStart = searchParams.get("weekStart");

    const where: Record<string, unknown> = { tenantId: tenant.id };

    if (weekStart) {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);

      where.class = { startsAt: { gte: start, lt: end }, tenantId: tenant.id };
    }

    const quotas = await prisma.schedulePlatformQuota.findMany({
      where,
      include: {
        class: {
          include: {
            classType: { select: { name: true, color: true } },
            room: { select: { name: true, maxCapacity: true } },
            coach: { include: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { class: { startsAt: "asc" } },
    });

    return NextResponse.json(quotas);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/quotas error:", error);
    return NextResponse.json({ error: "Failed to fetch quotas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { classId, platform, quotaSpots } = body as {
      classId: string;
      platform: PlatformType;
      quotaSpots: number;
    };

    if (!classId || !platform || quotaSpots == null) {
      return NextResponse.json({ error: "classId, platform, and quotaSpots are required" }, { status: 400 });
    }

    if (!["classpass", "wellhub"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const quota = await prisma.schedulePlatformQuota.upsert({
      where: { classId_platform: { classId, platform } },
      create: {
        tenantId: tenant.id,
        classId,
        platform,
        quotaSpots,
      },
      update: { quotaSpots },
    });

    return NextResponse.json(quota);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/quotas error:", error);
    return NextResponse.json({ error: "Failed to save quota" }, { status: 500 });
  }
}
