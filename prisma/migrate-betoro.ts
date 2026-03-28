/**
 * Data migration: Create "betoro" tenant and assign all existing data.
 *
 * Run with: npx tsx prisma/migrate-betoro.ts
 *
 * Safe to run multiple times (idempotent via upsert).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Betoro tenant migration...\n");

  // 1. Read existing branding from StudioSettings
  const settings = await prisma.studioSettings.findUnique({
    where: { id: "singleton" },
  });

  // 2. Create (or update) the Betoro tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "betoro" },
    update: {},
    create: {
      slug: "betoro",
      name: settings?.studioName || "Betoro",
      tagline: settings?.tagline || "Pilates & Wellness",
      slogan: settings?.slogan || "Muévete. Respira. Floréce.",
      metaDescription:
        settings?.metaDescription || "Tu espacio de Pilates y bienestar.",
      logoUrl: settings?.logoUrl,
      appIconUrl: settings?.appIconUrl,
      fontPairing: settings?.fontPairing || "jakarta-dmsans",
      colorBg: settings?.colorBg || "#FAF9F6",
      colorFg: settings?.colorFg || "#1C1917",
      colorSurface: settings?.colorSurface || "#F5F2ED",
      colorAccent: settings?.colorAccent || "#C9A96E",
      colorAccentSoft: settings?.colorAccentSoft || "#E8D9BF",
      colorMuted: settings?.colorMuted || "#8C8279",
      colorBorder: settings?.colorBorder || "#E8E2D9",
      colorCoach: settings?.colorCoach || "#2D5016",
      colorAdmin: settings?.colorAdmin || "#1A2C4E",
      coachIconSvg: settings?.coachIconSvg,
    },
  });
  console.log(`Tenant created: ${tenant.name} (${tenant.id})\n`);

  // 3. Create Memberships from existing User.role
  const users = await prisma.user.findMany({
    select: { id: true, role: true },
  });

  let membershipCount = 0;
  for (const user of users) {
    await prisma.membership.upsert({
      where: {
        userId_tenantId: { userId: user.id, tenantId: tenant.id },
      },
      update: {},
      create: {
        userId: user.id,
        tenantId: tenant.id,
        role: user.role,
      },
    });
    membershipCount++;
  }
  console.log(`Memberships created: ${membershipCount}`);

  // 4. Mark first ADMIN as superAdmin
  const firstAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (firstAdmin) {
    await prisma.user.update({
      where: { id: firstAdmin.id },
      data: { isSuperAdmin: true },
    });
    console.log(`Super admin: ${firstAdmin.email}`);
  }

  // 5. Assign tenantId to all existing rows via raw SQL (fastest for bulk)
  const tid = tenant.id;

  const tables = [
    "Studio",
    "Room",
    "ClassType",
    "CoachProfile",
    "Class",
    "Booking",
    "Waitlist",
    "Package",
    "UserPackage",
    "FeedEvent",
    "Notification",
    "MemberAchievement",
    "MemberReward",
    "MemberProgress",
    "Friendship",
    "PushSubscription",
  ];

  for (const table of tables) {
    const result =
      await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "tenantId" = '${tid}' WHERE "tenantId" IS NULL`);
    console.log(`${table}: ${result} rows updated`);
  }

  console.log("\nMigration complete!");
  console.log(`\nRollback info:`);
  console.log(`  Tenant ID: ${tenant.id}`);
  console.log(`  To undo: UPDATE each table SET "tenantId" = NULL`);
  console.log(`  Then: DELETE FROM "Tenant" WHERE slug = 'betoro'`);
  console.log(`  Then: DELETE FROM "Membership" WHERE "tenantId" = '${tid}'`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
