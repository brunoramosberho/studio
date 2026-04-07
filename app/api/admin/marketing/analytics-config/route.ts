import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const config = await prisma.tenantAnalyticsConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
    });

    return NextResponse.json(
      config || {
        ga4MeasurementId: null,
        ga4ApiSecret: null,
        metaPixelId: null,
        gtmContainerId: null,
        ga4EventPurchase: true,
        ga4EventBeginCheckout: true,
        ga4EventViewItem: true,
        ga4EventSignUp: true,
        metaEventPurchase: true,
        metaEventInitiateCheckout: true,
        metaEventCompleteRegistration: true,
        metaEventViewContent: false,
      }
    );
  } catch (error) {
    console.error("GET /api/admin/marketing/analytics-config error:", error);
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const body = await req.json();

    const allowedKeys = [
      "ga4MeasurementId",
      "ga4ApiSecret",
      "metaPixelId",
      "gtmContainerId",
      "ga4EventPurchase",
      "ga4EventBeginCheckout",
      "ga4EventViewItem",
      "ga4EventSignUp",
      "metaEventPurchase",
      "metaEventInitiateCheckout",
      "metaEventCompleteRegistration",
      "metaEventViewContent",
    ];

    const data: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in body) data[key] = body[key];
    }

    const config = await prisma.tenantAnalyticsConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: { tenantId: ctx.tenant.id, ...data },
      update: data,
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error("PATCH /api/admin/marketing/analytics-config error:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 }
    );
  }
}
