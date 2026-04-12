import { prisma } from "@/lib/db";

const DEMO_EMAIL_DOMAIN = "@demo.mgic.app";

export interface GraduateResult {
  feedEventsDeleted: number;
  classesDeleted: number;
  demoUsersDeleted: number;
  kept: {
    tenant: boolean;
    classTypes: number;
    studios: number;
    rooms: number;
    packages: number;
  };
}

/**
 * "Graduate" a demo tenant to production by removing all fake data
 * while preserving the business configuration.
 *
 * Deletes:
 * - All feed events (cascades: likes, comments, photos, polls)
 * - All classes (cascades: bookings, waitlists, blocked spots, ratings)
 * - All users with @demo.mgic.app emails (cascades: memberships, friendships)
 * - Coach profiles linked to demo users
 *
 * Preserves:
 * - Tenant (branding, colors, settings)
 * - ClassTypes (disciplines with colors, icons, tags)
 * - Studios + Rooms (locations, capacity)
 * - Packages (pricing)
 * - Real user memberships (super-admin)
 */
export async function graduateTenant(tenantId: string): Promise<GraduateResult> {
  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      _count: {
        select: { classTypes: true, studios: true, rooms: true, packages: true },
      },
    },
  });
  if (!tenant) throw new Error("Tenant no encontrado");

  // 1. Find all demo users linked to this tenant
  const demoMemberships = await prisma.membership.findMany({
    where: {
      tenantId,
      user: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    },
    select: { userId: true },
  });
  const demoUserIds = demoMemberships.map((m) => m.userId);

  // 2. Delete feed events for this tenant
  //    (cascades: likes, comments, photos, polls via onDelete: Cascade)
  const feedResult = await prisma.feedEvent.deleteMany({
    where: { tenantId },
  });

  // 3. Delete notifications for this tenant
  await prisma.notification.deleteMany({ where: { tenantId } });

  // 4. Delete all classes for this tenant
  //    (cascades: bookings, waitlists, blocked spots, song requests, etc.)
  const classResult = await prisma.class.deleteMany({
    where: { tenantId },
  });

  // 5. Delete coach profiles linked to demo users
  if (demoUserIds.length > 0) {
    await prisma.coachProfile.deleteMany({
      where: { tenantId, userId: { in: demoUserIds } },
    });
  }

  // 6. Delete member progress for demo users
  if (demoUserIds.length > 0) {
    await prisma.memberProgress.deleteMany({
      where: { tenantId, userId: { in: demoUserIds } },
    });
    await prisma.memberAchievement.deleteMany({
      where: { tenantId, userId: { in: demoUserIds } },
    });
  }

  // 7. Delete demo users
  //    (cascades: memberships, friendships, sessions, accounts, etc.)
  const userResult = await prisma.user.deleteMany({
    where: {
      id: { in: demoUserIds },
      email: { endsWith: DEMO_EMAIL_DOMAIN },
    },
  });

  return {
    feedEventsDeleted: feedResult.count,
    classesDeleted: classResult.count,
    demoUsersDeleted: userResult.count,
    kept: {
      tenant: true,
      classTypes: tenant._count.classTypes,
      studios: tenant._count.studios,
      rooms: tenant._count.rooms,
      packages: tenant._count.packages,
    },
  };
}
