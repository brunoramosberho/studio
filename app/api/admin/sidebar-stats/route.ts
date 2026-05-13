import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      activeClasses,
      pendingWaitlist,
      newClients,
      recentFeed,
      pendingNoShows,
      activeOrders,
      tenantFlags,
      anyShop,
      preOrderableCount,
      onDemandConfig,
      gamificationConfig,
      referralConfig,
    ] = await Promise.all([
      prisma.class.count({
        where: { tenantId: tenant.id, status: "SCHEDULED", startsAt: { gte: now } },
      }),
      prisma.waitlist.count({
        where: {
          tenantId: tenant.id,
          class: { status: "SCHEDULED", startsAt: { gte: now } },
        },
      }),
      prisma.membership.count({
        where: { tenantId: tenant.id, role: "CLIENT", createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.feedEvent.count({
        where: { tenantId: tenant.id, eventType: "STUDIO_POST", createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.pendingPenalty.count({
        where: { tenantId: tenant.id, status: "pending" },
      }),
      prisma.bookingProductOrder.count({
        where: {
          tenantId: tenant.id,
          status: { in: ["PAID", "READY"] },
        },
      }),
      prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: {
          highlightsEnabled: true,
          noShowPenaltyEnabled: true,
        },
      }),
      prisma.studio.count({
        where: { tenantId: tenant.id, productsEnabled: true },
      }),
      // Bar orders is only meaningful when at least one product is
      // pre-orderable. Plain retail products (clothing, etc.) don't enable it.
      prisma.product.count({
        where: { tenantId: tenant.id, availableForPreOrder: true, isActive: true },
      }),
      prisma.onDemandConfig.findUnique({
        where: { tenantId: tenant.id },
        select: { enabled: true },
      }),
      prisma.tenantGamificationConfig.findUnique({
        where: { tenantId: tenant.id },
        select: { achievementsEnabled: true, levelsEnabled: true },
      }),
      prisma.referralConfig.findUnique({
        where: { tenantId: tenant.id },
        select: { isEnabled: true },
      }),
    ]);

    return NextResponse.json({
      activeClasses,
      pendingWaitlist,
      newClients,
      recentFeed,
      pendingNoShows,
      activeOrders,
      flags: {
        highlights: tenantFlags?.highlightsEnabled ?? false,
        noShows: tenantFlags?.noShowPenaltyEnabled ?? false,
        shop: anyShop > 0,
        orders: preOrderableCount > 0,
        onDemand: onDemandConfig?.enabled ?? false,
        achievements:
          (gamificationConfig?.achievementsEnabled ?? false) ||
          (gamificationConfig?.levelsEnabled ?? false),
        referrals: referralConfig?.isEnabled ?? false,
        // Always-on: the platforms hub doubles as the discovery entry point
        // for Wellhub / ClassPass — must be reachable from ⌘K and the sidebar
        // even before any partner config exists.
        platforms: true,
      },
    });
  } catch {
    return NextResponse.json({
      activeClasses: 0,
      pendingWaitlist: 0,
      newClients: 0,
      recentFeed: 0,
      pendingNoShows: 0,
      activeOrders: 0,
      flags: {
        highlights: false,
        noShows: false,
        shop: false,
        orders: false,
        onDemand: false,
        achievements: false,
        referrals: false,
        platforms: false,
      },
    });
  }
}
