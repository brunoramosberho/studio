import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  try {
    const ctx = await requireRole("ADMIN");
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

    const utmSources: Record<string, number> = {};
    for (const c of clicks) {
      const src = c.utmSource || "(directo)";
      utmSources[src] = (utmSources[src] || 0) + 1;
    }

    const topSources = Object.entries(utmSources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    return NextResponse.json({
      clicksByDay,
      conversionsByDay,
      topSources,
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
