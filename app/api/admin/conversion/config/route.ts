import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { getConversionConfig } from "@/lib/conversion/nudge-engine";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const config = await getConversionConfig(tenant.id);
    return NextResponse.json(config);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("GET /api/admin/conversion/config error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();

    const allowedFields = [
      "showInBookingFlow",
      "featuredMembershipId",
      "showSavingsBanner",
      "introOfferEnabled",
      "introOfferPrice",
      "introOfferMembershipId",
      "introOfferTimerHours",
      "savingsEmailEnabled",
      "savingsEmailTriggerClasses",
      "savingsEmailDelayHours",
      "packageUpgradeEnabled",
      "packageUpgradeTrigger",
      "packageUpgradeTiming",
      "packageUpgradeCredit",
      "maxNudgesPerMemberPerWeek",
    ] as const;

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field];
      }
    }

    const config = await prisma.membershipConversionConfig.upsert({
      where: { tenantId: tenant.id },
      update: data,
      create: { tenantId: tenant.id, ...data },
    });

    return NextResponse.json(config);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("PATCH /api/admin/conversion/config error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
