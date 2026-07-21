import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  try {
    const ctx = await requirePermission("marketing");
    const tenantId = ctx.tenant.id;
    const { entityType, entityId } = await params;

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "30d";

    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [clicks, conversions] = await Promise.all([
      prisma.linkClick.findMany({
        where: {
          tenantId,
          entityType,
          entityId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.linkConversion.findMany({
        where: {
          tenantId,
          entityType,
          entityId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const clicksByDay: Record<string, number> = {};
    const conversionsByDay: Record<string, number> = {};

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const key = d.toISOString().slice(0, 10);
      clicksByDay[key] = 0;
      conversionsByDay[key] = 0;
    }

    for (const c of clicks) {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (key in clicksByDay) clicksByDay[key]++;
    }

    for (const c of conversions) {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (key in conversionsByDay) conversionsByDay[key]++;
    }

    // Per-channel breakdown. A conversion is attributed to the utm_source of
    // the click it was matched to — fetched by id so a click that predates the
    // range still attributes correctly; truly unmatched ones are "(directo)".
    const convClickIds = conversions
      .map((c) => c.linkClickId)
      .filter((id): id is string => !!id);
    const convClicks = convClickIds.length
      ? await prisma.linkClick.findMany({
          where: { id: { in: convClickIds } },
          select: { id: true, utmSource: true },
        })
      : [];
    const clickSourceById = new Map(convClicks.map((c) => [c.id, c.utmSource || "(directo)"]));
    const bySource = new Map<string, { clicks: number; conversions: number; revenue: number }>();
    const bump = (src: string) => {
      const e = bySource.get(src) ?? { clicks: 0, conversions: 0, revenue: 0 };
      bySource.set(src, e);
      return e;
    };
    for (const c of clicks) {
      bump(c.utmSource || "(directo)").clicks++;
    }
    for (const cv of conversions) {
      const src = (cv.linkClickId && clickSourceById.get(cv.linkClickId)) || "(directo)";
      const e = bump(src);
      e.conversions++;
      e.revenue += cv.revenue || 0;
    }
    const sources = [...bySource.entries()]
      .map(([source, s]) => ({ source, ...s }))
      .sort((a, b) => b.clicks - a.clicks || b.conversions - a.conversions)
      .slice(0, 12);

    return NextResponse.json({
      clicksByDay,
      conversionsByDay,
      sources,
      totalClicks: clicks.length,
      totalConversions: conversions.length,
      totalRevenue: conversions.reduce((s, c) => s + (c.revenue || 0), 0),
    });
  } catch (error) {
    console.error("GET /api/admin/marketing/links/stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
