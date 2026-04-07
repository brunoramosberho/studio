import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { platform } = await params;

    if (!["classpass", "gympass"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: platform as PlatformType } },
      select: { locationMappings: true },
    });

    return NextResponse.json({ mappings: config?.locationMappings ?? {} });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/config/[platform]/locations error:", error);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { platform } = await params;
    const body = await request.json();
    const { mappings } = body as { mappings: Record<string, string> };

    if (!["classpass", "gympass"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    if (!mappings || typeof mappings !== "object") {
      return NextResponse.json({ error: "Invalid mappings" }, { status: 400 });
    }

    const config = await prisma.studioPlatformConfig.update({
      where: { tenantId_platform: { tenantId: tenant.id, platform: platform as PlatformType } },
      data: { locationMappings: mappings },
    });

    return NextResponse.json({ mappings: config.locationMappings });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/platforms/config/[platform]/locations error:", error);
    return NextResponse.json({ error: "Failed to update locations" }, { status: 500 });
  }
}
