import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/**
 * Permanently delete a tenant and ALL its data.
 * Requires the tenant slug in the body as confirmation.
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

    // Delete in dependency order. Most relations cascade from Tenant,
    // but some have user-level FKs that don't cascade from Tenant.
    // Delete tenant-scoped user-linked data first.

    // Find all users with memberships in this tenant
    const memberships = await prisma.membership.findMany({
      where: { tenantId: id },
      select: { userId: true },
    });
    const userIds = memberships.map((m) => m.userId);

    // Feed events (cascades: likes, comments, photos, polls)
    await prisma.feedEvent.deleteMany({ where: { tenantId: id } });

    // Classes (cascades: bookings, waitlists, blocked spots, song requests, etc.)
    await prisma.class.deleteMany({ where: { tenantId: id } });

    // Notifications
    await prisma.notification.deleteMany({ where: { tenantId: id } });

    // Member progress & achievements
    await prisma.memberProgress.deleteMany({ where: { tenantId: id } });
    await prisma.memberAchievement.deleteMany({ where: { tenantId: id } });
    await prisma.memberReward.deleteMany({ where: { tenantId: id } });

    // Friendships
    await prisma.friendship.deleteMany({ where: { tenantId: id } });

    // User packages
    await prisma.userPackage.deleteMany({ where: { tenantId: id } });

    // Coach profiles & pay rates
    await prisma.coachAvailabilityBlock.deleteMany({ where: { tenantId: id } });
    await prisma.coachProfile.deleteMany({ where: { tenantId: id } });

    // Rooms, studios
    await prisma.room.deleteMany({ where: { tenantId: id } });
    await prisma.studio.deleteMany({ where: { tenantId: id } });

    // Class types, packages
    await prisma.classType.deleteMany({ where: { tenantId: id } });
    await prisma.package.deleteMany({ where: { tenantId: id } });

    // Memberships
    await prisma.membership.deleteMany({ where: { tenantId: id } });

    // Delete demo users (only @demo.mgic.app, not real users)
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
