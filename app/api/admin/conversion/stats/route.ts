import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const tenantId = tenant.id;

    const range = request.nextUrl.searchParams.get("range") ?? "30d";
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;

    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

    const [currentEvents, prevEvents, bookingsWithoutSub] = await Promise.all([
      prisma.nudgeEvent.findMany({
        where: { tenantId, shownAt: { gte: since } },
        select: {
          type: true,
          shown: true,
          interacted: true,
          converted: true,
          revenue: true,
          membershipId: true,
          convertedAt: true,
          user: { select: { name: true } },
        },
      }),
      prisma.nudgeEvent.findMany({
        where: { tenantId, shownAt: { gte: prevSince, lt: since } },
        select: {
          shown: true,
          converted: true,
          revenue: true,
        },
      }),
      prisma.booking.count({
        where: {
          tenantId,
          createdAt: { gte: since },
          status: { not: "CANCELLED" },
          user: {
            packages: {
              none: {
                tenantId,
                package: { type: "SUBSCRIPTION" },
                expiresAt: { gt: now },
              },
            },
          },
        },
      }),
    ]);

    const nudgesShown = currentEvents.filter((e) => e.shown).length;
    const interacted = currentEvents.filter((e) => e.interacted).length;
    const conversions = currentEvents.filter((e) => e.converted).length;
    const mrr = currentEvents.reduce((s, e) => s + (e.revenue ?? 0), 0);
    const conversionRate = nudgesShown > 0 ? conversions / nudgesShown : 0;

    const prevNudges = prevEvents.filter((e) => e.shown).length;
    const prevConversions = prevEvents.filter((e) => e.converted).length;
    const prevMrr = prevEvents.reduce((s, e) => s + (e.revenue ?? 0), 0);

    const nudgeTypes = [
      "booking_flow",
      "intro_offer",
      "savings_email",
      "package_upgrade",
      "post_class",
    ] as const;

    const byAutomation = nudgeTypes.map((type) => {
      const ofType = currentEvents.filter((e) => e.type === type);
      const shown = ofType.filter((e) => e.shown).length;
      const converted = ofType.filter((e) => e.converted).length;
      const typeMrr = ofType.reduce((s, e) => s + (e.revenue ?? 0), 0);
      return {
        type,
        shown,
        converted,
        conversionRate: shown > 0 ? converted / shown : 0,
        mrr: typeMrr,
      };
    }).sort((a, b) => b.mrr - a.mrr);

    const membershipNames = new Map<string, string>();
    const membershipIds = [
      ...new Set(
        currentEvents
          .filter((e) => e.converted && e.membershipId)
          .map((e) => e.membershipId!),
      ),
    ];
    if (membershipIds.length > 0) {
      const pkgs = await prisma.package.findMany({
        where: { id: { in: membershipIds } },
        select: { id: true, name: true },
      });
      pkgs.forEach((p) => membershipNames.set(p.id, p.name));
    }

    const recentConversions = currentEvents
      .filter((e) => e.converted)
      .sort(
        (a, b) =>
          (b.convertedAt?.getTime() ?? 0) - (a.convertedAt?.getTime() ?? 0),
      )
      .slice(0, 20)
      .map((e) => ({
        memberName: e.user.name ?? "Sin nombre",
        nudgeType: e.type,
        membershipName: e.membershipId
          ? membershipNames.get(e.membershipId) ?? "—"
          : "—",
        revenue: e.revenue ?? 0,
        convertedAt: e.convertedAt,
      }));

    const pctChange = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    return NextResponse.json({
      totals: {
        nudgesShown,
        conversions,
        conversionRate,
        mrr,
      },
      funnel: {
        reservasWithoutMembership: bookingsWithoutSub,
        nudgesShown,
        interacted,
        converted: conversions,
      },
      byAutomation,
      recentConversions,
      trends: {
        vsLastPeriod: {
          nudges: pctChange(nudgesShown, prevNudges),
          conversions: pctChange(conversions, prevConversions),
          mrr: pctChange(mrr, prevMrr),
        },
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    console.error("GET /api/admin/conversion/stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
