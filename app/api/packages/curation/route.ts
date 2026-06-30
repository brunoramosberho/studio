import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";

/**
 * Public curated-packages config for the booking flow + /packages. When enabled,
 * the client shows the hand-picked set (ordered, with one "recommended" pick) for
 * the viewer's audience — never-purchased ("firstTimer") vs returning — and hides
 * the rest behind a "see more". Off → the client shows the full list as before.
 */
export async function GET() {
  const empty = {
    enabled: false,
    firstTimer: { ids: [] as string[], recommendedId: null as string | null },
    returning: { ids: [] as string[], recommendedId: null as string | null },
  };
  try {
    const tenant = await requireTenant();
    const config = await prisma.membershipConversionConfig.findUnique({
      where: { tenantId: tenant.id },
      select: {
        curatedEnabled: true,
        curatedFirstTimerIds: true,
        curatedFirstTimerRecommendedId: true,
        curatedReturningIds: true,
        curatedReturningRecommendedId: true,
      },
    });
    if (!config) return NextResponse.json(empty);
    return NextResponse.json({
      enabled: config.curatedEnabled,
      firstTimer: {
        ids: config.curatedFirstTimerIds,
        recommendedId: config.curatedFirstTimerRecommendedId,
      },
      returning: {
        ids: config.curatedReturningIds,
        recommendedId: config.curatedReturningRecommendedId,
      },
    });
  } catch (error) {
    console.error("GET /api/packages/curation error:", error);
    return NextResponse.json(empty);
  }
}
