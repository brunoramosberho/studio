// Per-tenant Wellhub configuration: gym_id, mode toggle, implementation
// method, locale. Stored on the existing StudioPlatformConfig row keyed by
// (tenantId, platform=wellhub). Webhook secret is set separately by the
// "register webhooks" endpoint and never exposed in responses.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
    });
    if (!config) return NextResponse.json(null);

    // Strip the encrypted secret from the response — we only signal "set / not set".
    const { wellhubWebhookSecret, ...safe } = config;
    return NextResponse.json({
      ...safe,
      wellhubWebhookSecretSet: !!wellhubWebhookSecret,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/platforms/wellhub/config error:", error);
    return NextResponse.json({ error: "Failed to load Wellhub config" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const {
      wellhubGymId,
      wellhubMode,
      wellhubImplMethod,
      wellhubLocale,
      ratePerVisit,
      portalUrl,
      isActive,
    } = body as {
      wellhubGymId?: number | null;
      wellhubMode?: "disabled" | "legacy_email" | "api";
      wellhubImplMethod?: "attendance_trigger" | "gate_trigger";
      wellhubLocale?: string | null;
      ratePerVisit?: number | null;
      portalUrl?: string | null;
      isActive?: boolean;
    };

    if (wellhubMode && !["disabled", "legacy_email", "api"].includes(wellhubMode)) {
      return NextResponse.json({ error: "Invalid wellhubMode" }, { status: 400 });
    }
    if (wellhubImplMethod && !["attendance_trigger", "gate_trigger"].includes(wellhubImplMethod)) {
      return NextResponse.json({ error: "Invalid wellhubImplMethod" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (wellhubGymId !== undefined) data.wellhubGymId = wellhubGymId;
    if (wellhubMode !== undefined) data.wellhubMode = wellhubMode;
    if (wellhubImplMethod !== undefined) data.wellhubImplMethod = wellhubImplMethod;
    if (wellhubLocale !== undefined) data.wellhubLocale = wellhubLocale;
    if (ratePerVisit !== undefined) data.ratePerVisit = ratePerVisit;
    if (portalUrl !== undefined) data.portalUrl = portalUrl;
    if (isActive !== undefined) {
      data.isActive = isActive;
      if (isActive) data.activatedAt = new Date();
    }

    const inboundEmail = `wellhub.${tenant.slug}@in.mgic.app`;
    const config = await prisma.studioPlatformConfig.upsert({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      create: {
        tenantId: tenant.id,
        platform: "wellhub",
        inboundEmail,
        ...data,
      },
      update: data,
    });

    const { wellhubWebhookSecret, ...safe } = config;
    return NextResponse.json({
      ...safe,
      wellhubWebhookSecretSet: !!wellhubWebhookSecret,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("PATCH /api/platforms/wellhub/config error:", error);
    return NextResponse.json({ error: "Failed to update Wellhub config" }, { status: 500 });
  }
}
