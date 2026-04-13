import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/**
 * Permanently delete a tenant and ALL its data.
 * Requires the tenant slug in the body as confirmation.
 * Deletes from every tenant-scoped table in safe dependency order.
 * Only deletes @demo.mgic.app users, never real users.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;
    const { confirmSlug } = await req.json();

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { slug: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    if (confirmSlug !== tenant.slug) {
      return NextResponse.json(
        { error: "El slug de confirmación no coincide" },
        { status: 400 },
      );
    }

    console.log(`[tenants/nuke] Deleting tenant "${tenant.slug}" (${id}) and ALL data...`);

    const tid = { where: { tenantId: id } };

    // Collect demo user IDs before deleting memberships
    const memberships = await prisma.membership.findMany({
      where: { tenantId: id },
      select: { userId: true },
    });
    const userIds = memberships.map((m) => m.userId);

    // ── Delete all tenant-scoped data in dependency order ──

    // Waivers
    await prisma.waiverSignature.deleteMany(tid);
    await prisma.waiver.deleteMany(tid);

    // Platform integrations
    await prisma.platformAlert.deleteMany(tid);
    await prisma.platformBooking.deleteMany(tid);
    await prisma.schedulePlatformQuota.deleteMany(tid);
    await prisma.studioPlatformConfig.deleteMany(tid);

    // Check-ins
    await prisma.checkIn.deleteMany(tid);

    // Feed (cascades: likes, comments, photos, polls)
    await prisma.feedEvent.deleteMany(tid);

    // Notifications & push
    await prisma.notification.deleteMany(tid);
    await prisma.pushSubscription.deleteMany(tid);

    // Classes (cascades: bookings, waitlists, blocked spots, song requests, playlists)
    await prisma.class.deleteMany(tid);

    // Coach
    await prisma.coachAvailabilityBlock.deleteMany(tid);
    await prisma.coachProfile.deleteMany(tid);

    // Class types
    await prisma.classType.deleteMany(tid);

    // Packages & user packages
    await prisma.userPackage.deleteMany(tid);
    await prisma.package.deleteMany(tid);

    // Rooms & studios
    await prisma.room.deleteMany(tid);
    await prisma.studio.deleteMany(tid);

    // Gamification
    await prisma.memberProgress.deleteMany(tid);
    await prisma.memberAchievement.deleteMany(tid);
    await prisma.memberReward.deleteMany(tid);

    // Social
    await prisma.friendship.deleteMany(tid);

    // Shop
    await prisma.product.deleteMany(tid);
    await prisma.productCategory.deleteMany(tid);

    // Memberships
    await prisma.membership.deleteMany(tid);

    // Tenant-level configs
    try { await prisma.tenantGamificationConfig.deleteMany(tid); } catch { /* may not exist */ }
    try { await prisma.membershipConversionConfig.deleteMany({ where: { tenantId: id } }); } catch { /* may not exist */ }
    try { await prisma.tenantAnalyticsConfig.deleteMany({ where: { tenantId: id } }); } catch { /* may not exist */ }
    try { await prisma.referralConfig.deleteMany({ where: { tenantId: id } }); } catch { /* may not exist */ }
    try { await prisma.referralReward.deleteMany(tid); } catch { /* may not exist */ }
    try { await prisma.nudgeEvent.deleteMany(tid); } catch { /* may not exist */ }
    try { await prisma.introOfferClaim.deleteMany(tid); } catch { /* may not exist */ }
    try { await prisma.linkClick.deleteMany(tid); } catch { /* may not exist */ }
    try { await prisma.classRating.deleteMany(tid); } catch { /* may not exist */ }
    try { await prisma.memberSubscription.deleteMany(tid); } catch { /* may not exist */ }
    try { await prisma.instagramIntegration.deleteMany(tid); } catch { /* may not exist */ }

    // Delete only demo users (never real users)
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: { in: userIds },
          email: { endsWith: "@demo.mgic.app" },
        },
      });
    }

    // Finally, delete the tenant itself
    await prisma.tenant.delete({ where: { id } });

    console.log(`[tenants/nuke] Tenant "${tenant.slug}" permanently deleted`);

    return NextResponse.json({ deleted: true, slug: tenant.slug });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "Unauthorized") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "Forbidden") return NextResponse.json({ error: msg }, { status: 403 });
    console.error("[tenants/nuke]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
