import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant, getTenantCurrency } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
    }

    const body = await req.json();
    const { entityType, entityId, conversionType, revenue, memberId } = body;

    if (!entityType || !entityId || !conversionType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Last-click attribution: find the most recent click for this entity (within 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentClick = await prisma.linkClick.findFirst({
      where: {
        tenantId: tenant.id,
        entityType,
        entityId,
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const linkClickId = recentClick?.id || null;

    await prisma.linkConversion.create({
      data: {
        tenantId: tenant.id,
        linkClickId,
        entityType,
        entityId,
        conversionType,
        revenue: revenue || null,
        memberId: memberId || null,
      },
    });

    // Server-side GA4 Measurement Protocol (fire-and-forget)
    const config = await prisma.tenantAnalyticsConfig.findUnique({
      where: { tenantId: tenant.id },
    });

    if (config?.ga4MeasurementId && config?.ga4ApiSecret) {
      const ga4Event = conversionType === "booking" ? "purchase" : conversionType === "signup" ? "sign_up" : "purchase";
      const tenantCurrency = await getTenantCurrency();

      fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${config.ga4MeasurementId}&api_secret=${config.ga4ApiSecret}`,
        {
          method: "POST",
          body: JSON.stringify({
            client_id: memberId || "anonymous",
            events: [
              {
                name: ga4Event,
                params: {
                  transaction_id: `conv_${Date.now()}`,
                  value: revenue || 0,
                  currency: tenantCurrency.code,
                  items: [{ item_name: entityId, item_category: entityType }],
                },
              },
            ],
          }),
        }
      ).catch((err) => console.error("GA4 MP error:", err));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/marketing/track/conversion error:", error);
    return NextResponse.json({ error: "Failed to track conversion" }, { status: 500 });
  }
}
