// Per-tenant Wellhub configuration: gym_id, mode toggle, locale, auth token.
// Stored on the existing StudioPlatformConfig row keyed by
// (tenantId, platform=wellhub). The auth token and webhook secret are stored
// encrypted (via lib/encryption.ts) and never exposed in responses — the API
// only signals "set" / "not set" via boolean flags.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { requireRole } from "@/lib/tenant";

function strip(config: Awaited<ReturnType<typeof prisma.studioPlatformConfig.findUnique>>) {
  if (!config) return null;
  const { wellhubWebhookSecret, wellhubAuthToken, ...safe } = config;
  return {
    ...safe,
    wellhubWebhookSecretSet: !!wellhubWebhookSecret,
    wellhubAuthTokenSet: !!wellhubAuthToken,
  };
}

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
    });
    return NextResponse.json(strip(config));
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
      wellhubLocale,
      wellhubAuthToken,
      ratePerVisit,
      maxPayoutPerVisitor,
      noShowPercent,
      lateCancelPercent,
      freeVisitsPerMonth,
      wellhubDefaultQuota,
      portalUrl,
      isActive,
    } = body as {
      wellhubGymId?: number | null;
      wellhubMode?: "disabled" | "legacy_email" | "api";
      wellhubLocale?: string | null;
      /** Plaintext bearer token from Wellhub — encrypted before storage. */
      wellhubAuthToken?: string | null;
      ratePerVisit?: number | null;
      maxPayoutPerVisitor?: number | null;
      /** Fraction 0..1 (UI sends percent; we store the fraction). */
      noShowPercent?: number | null;
      lateCancelPercent?: number | null;
      freeVisitsPerMonth?: number | null;
      wellhubDefaultQuota?: number | null;
      portalUrl?: string | null;
      isActive?: boolean;
    };

    if (wellhubMode && !["disabled", "legacy_email", "api"].includes(wellhubMode)) {
      return NextResponse.json({ error: "Invalid wellhubMode" }, { status: 400 });
    }

    // Percentages arrive as fractions (0..1). Clamp defensively.
    const clampFraction = (v: number | null | undefined) =>
      v == null ? v : Math.max(0, Math.min(1, v));

    const data: Record<string, unknown> = {};
    if (wellhubGymId !== undefined) data.wellhubGymId = wellhubGymId;
    if (wellhubMode !== undefined) data.wellhubMode = wellhubMode;
    if (wellhubLocale !== undefined) data.wellhubLocale = wellhubLocale;
    if (ratePerVisit !== undefined) data.ratePerVisit = ratePerVisit;
    if (maxPayoutPerVisitor !== undefined) data.maxPayoutPerVisitor = maxPayoutPerVisitor;
    if (noShowPercent !== undefined) data.noShowPercent = clampFraction(noShowPercent);
    if (lateCancelPercent !== undefined) data.lateCancelPercent = clampFraction(lateCancelPercent);
    if (freeVisitsPerMonth !== undefined) data.freeVisitsPerMonth = freeVisitsPerMonth;
    if (wellhubDefaultQuota !== undefined) {
      data.wellhubDefaultQuota =
        wellhubDefaultQuota == null ? null : Math.max(0, Math.floor(wellhubDefaultQuota));
    }
    if (portalUrl !== undefined) data.portalUrl = portalUrl;
    if (isActive !== undefined) {
      data.isActive = isActive;
      if (isActive) data.activatedAt = new Date();
    }
    if (wellhubAuthToken !== undefined) {
      // null/empty string explicitly clears the token; otherwise encrypt.
      data.wellhubAuthToken = wellhubAuthToken
        ? encrypt(wellhubAuthToken.trim())
        : null;
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

    return NextResponse.json(strip(config));
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("PATCH /api/platforms/wellhub/config error:", error);
    return NextResponse.json({ error: "Failed to update Wellhub config" }, { status: 500 });
  }
}
