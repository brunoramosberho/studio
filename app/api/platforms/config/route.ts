import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { generateInboundEmail } from "@/lib/platforms/email";
import type { PlatformType } from "@prisma/client";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const configs = await prisma.studioPlatformConfig.findMany({
      where: { tenantId: tenant.id },
      orderBy: { platform: "asc" },
    });

    return NextResponse.json(configs);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/platforms/config error:", error);
    return NextResponse.json({ error: "Failed to fetch platform configs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { platform } = body as { platform: PlatformType };

    if (!platform || !["classpass", "wellhub"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const existing = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform } },
    });

    if (existing) {
      return NextResponse.json({ error: "Platform already configured" }, { status: 409 });
    }

    const inboundEmail = generateInboundEmail(tenant.slug, platform);

    const config = await prisma.studioPlatformConfig.create({
      data: {
        tenantId: tenant.id,
        platform,
        inboundEmail,
      },
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/platforms/config error:", error);
    return NextResponse.json({ error: "Failed to create platform config" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { platform, platformPartnerId, locationMappings, portalUrl, ratePerVisit, isActive } = body as {
      platform: PlatformType;
      platformPartnerId?: string;
      locationMappings?: Record<string, string>;
      portalUrl?: string;
      ratePerVisit?: number;
      isActive?: boolean;
    };

    if (!platform || !["classpass", "wellhub"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (platformPartnerId !== undefined) data.platformPartnerId = platformPartnerId;
    if (locationMappings !== undefined) data.locationMappings = locationMappings;
    if (portalUrl !== undefined) data.portalUrl = portalUrl;
    if (ratePerVisit !== undefined) data.ratePerVisit = ratePerVisit;
    if (isActive !== undefined) {
      data.isActive = isActive;
      if (isActive) data.activatedAt = new Date();
    }

    const config = await prisma.studioPlatformConfig.update({
      where: { tenantId_platform: { tenantId: tenant.id, platform } },
      data,
    });

    return NextResponse.json(config);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("PATCH /api/platforms/config error:", error);
    return NextResponse.json({ error: "Failed to update platform config" }, { status: 500 });
  }
}
