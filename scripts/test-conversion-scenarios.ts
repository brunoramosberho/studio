/**
 * Script para cambiar los paquetes de Bruno en Betoro
 * y probar diferentes escenarios de conversión.
 *
 * Uso: npx tsx scripts/test-conversion-scenarios.ts <scenario>
 *
 * Escenarios:
 *   reset      → Restaurar estado original (subscription + pack activos)
 *   booking    → Sin subscription ni pack → ve BookingFlowOptions con comparativa de ahorro
 *   upgrade    → Sin subscription, pack con 2 créditos → ve PackageUpgradeCard
 *   intro      → Sin subscription, sin pack, sin bookings previos → ve IntroOfferCard
 *   status     → Ver estado actual
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USER_EMAIL = "brunoramosberho@gmail.com";
const TENANT_SLUG = "betoro";

// IDs from the DB
const SUBSCRIPTION_PKG_ID = "cmng6go1e004ljr04tzk6txal"; // Ilimitado Mensual UserPackage
const PACK_25_PKG_ID = "cmnar19uj0003kz04qqsu9b86"; // Pack 25 Clases UserPackage
const PRIMERA_VEZ_PKG_ID = "cmnaqujik0001l704uavvqe8h"; // Primera Vez UserPackage

// Original values for reset
const ORIGINAL = {
  subscription: {
    creditsUsed: 9,
    expiresAt: new Date("2026-05-01T15:05:18.001Z"),
  },
  pack25: {
    creditsUsed: 5,
    expiresAt: new Date("2026-09-24T19:54:34.648Z"),
  },
};

async function getContext() {
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true, name: true },
  });
  if (!user) throw new Error("User not found");

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, tenant: { slug: TENANT_SLUG } },
    select: { tenantId: true },
  });
  if (!membership) throw new Error("No betoro membership");

  return { userId: user.id, tenantId: membership.tenantId };
}

async function showStatus() {
  const { userId, tenantId } = await getContext();

  const pkgs = await prisma.userPackage.findMany({
    where: { userId, tenantId },
    include: { package: { select: { name: true, type: true } } },
    orderBy: { expiresAt: "desc" },
  });

  const now = new Date();
  console.log("\n📦 User Packages:");
  for (const p of pkgs) {
    const active = p.expiresAt > now;
    const remaining =
      p.creditsTotal !== null ? p.creditsTotal - p.creditsUsed : "∞";
    console.log(
      `  ${active ? "✅" : "❌"} ${p.package.name} (${p.package.type}) — ${remaining} créditos — expira ${p.expiresAt.toISOString().slice(0, 10)}`,
    );
  }

  const nudgeEvents = await prisma.nudgeEvent.count({
    where: { userId, tenantId },
  });
  const introOffer = await prisma.introOfferClaim.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });

  console.log(`\n📊 Nudge Events: ${nudgeEvents}`);
  console.log(`🎁 Intro Offer Claim: ${introOffer ? `exists (accepted: ${!!introOffer.acceptedAt}, rejected: ${!!introOffer.rejectedAt})` : "none"}`);

  const config = await prisma.membershipConversionConfig.findUnique({
    where: { tenantId },
  });
  console.log(`\n⚙️  Config: featuredMembership=${config?.featuredMembershipId ?? "none"}, introOfferMembership=${config?.introOfferMembershipId ?? "none"}`);
}

async function scenarioReset() {
  console.log("🔄 Resetting to original state...");
  const { userId, tenantId } = await getContext();

  await prisma.userPackage.update({
    where: { id: SUBSCRIPTION_PKG_ID },
    data: ORIGINAL.subscription,
  });

  await prisma.userPackage.update({
    where: { id: PACK_25_PKG_ID },
    data: ORIGINAL.pack25,
  });

  // Delete packages created by conversion testing
  await deleteExtraPackages(userId, tenantId);

  // Clean up nudge events and intro offers created during testing
  await prisma.nudgeEvent.deleteMany({ where: { userId, tenantId } });
  await prisma.introOfferClaim.deleteMany({ where: { userId, tenantId } });

  console.log("✅ Reset complete — subscription + pack activos");
}

async function deleteExtraPackages(userId: string, tenantId: string) {
  const originals = [SUBSCRIPTION_PKG_ID, PACK_25_PKG_ID, PRIMERA_VEZ_PKG_ID];
  const extras = await prisma.userPackage.findMany({
    where: { userId, tenantId, id: { notIn: originals } },
    select: { id: true },
  });
  if (extras.length > 0) {
    await prisma.userPackage.deleteMany({
      where: { id: { in: extras.map((e) => e.id) } },
    });
    console.log(`  🗑️  Deleted ${extras.length} extra package(s) from testing`);
  }
}

async function scenarioBookingFlow() {
  console.log("🛒 Setting up: booking_flow scenario...");
  const { userId, tenantId } = await getContext();

  const past = new Date("2025-01-01T00:00:00Z");

  // Expire subscription
  await prisma.userPackage.update({
    where: { id: SUBSCRIPTION_PKG_ID },
    data: { expiresAt: past },
  });

  // Expire pack
  await prisma.userPackage.update({
    where: { id: PACK_25_PKG_ID },
    data: { expiresAt: past },
  });

  // Delete packages created by conversion testing
  await deleteExtraPackages(userId, tenantId);

  // Clear anti-spam nudges
  await prisma.nudgeEvent.deleteMany({ where: { userId, tenantId } });

  // Set featured membership in config
  const subPkg = await prisma.package.findFirst({
    where: { tenantId, type: "SUBSCRIPTION", isActive: true },
  });
  if (subPkg) {
    await prisma.membershipConversionConfig.upsert({
      where: { tenantId },
      update: { featuredMembershipId: subPkg.id },
      create: { tenantId, featuredMembershipId: subPkg.id },
    });
  }

  console.log("✅ booking_flow ready — sin subscription ni pack");
  console.log("   → Con 10 bookings este mes y clase a ~€17.5, total ~€175 vs mensual €139");
  console.log("   → Debería mostrar ahorro REAL de ~€36");
}

async function scenarioPackageUpgrade() {
  console.log("📦 Setting up: package_upgrade scenario...");
  const { userId, tenantId } = await getContext();

  const past = new Date("2025-01-01T00:00:00Z");

  // Expire subscription
  await prisma.userPackage.update({
    where: { id: SUBSCRIPTION_PKG_ID },
    data: { expiresAt: past },
  });

  // Pack with only 2 credits remaining (matches trigger=2)
  await prisma.userPackage.update({
    where: { id: PACK_25_PKG_ID },
    data: {
      creditsUsed: 23,
      expiresAt: new Date("2026-09-24T19:54:34.648Z"),
    },
  });

  // Clear anti-spam
  await prisma.nudgeEvent.deleteMany({ where: { userId, tenantId } });

  // Set config timing to pre_booking so it shows during booking context
  await prisma.membershipConversionConfig.upsert({
    where: { tenantId },
    update: { packageUpgradeTiming: "pre_booking" },
    create: { tenantId, packageUpgradeTiming: "pre_booking" },
  });

  console.log("✅ package_upgrade ready — pack con 2 créditos restantes");
  console.log("   → Crédito proporcional: 2 × (€399/25) = €31.92");
  console.log("   → Upgrade price: €139 - €31.92 = €107.08");
}

async function scenarioIntroOffer() {
  console.log("🎁 Setting up: intro_offer scenario...");
  const { userId, tenantId } = await getContext();

  const past = new Date("2025-01-01T00:00:00Z");

  // Expire all packages
  await prisma.userPackage.update({
    where: { id: SUBSCRIPTION_PKG_ID },
    data: { expiresAt: past },
  });
  await prisma.userPackage.update({
    where: { id: PACK_25_PKG_ID },
    data: { expiresAt: past },
  });

  // Cancel all bookings temporarily (to simulate first-time visitor)
  await prisma.booking.updateMany({
    where: { userId, tenantId, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });

  // Remove existing intro offer claim
  await prisma.introOfferClaim.deleteMany({ where: { userId, tenantId } });

  // Clear anti-spam
  await prisma.nudgeEvent.deleteMany({ where: { userId, tenantId } });

  // Configure intro offer membership
  const subPkg = await prisma.package.findFirst({
    where: { tenantId, type: "SUBSCRIPTION", isActive: true },
  });
  if (subPkg) {
    await prisma.membershipConversionConfig.upsert({
      where: { tenantId },
      update: {
        introOfferEnabled: true,
        introOfferPrice: 49,
        introOfferMembershipId: subPkg.id,
        introOfferTimerHours: 72,
      },
      create: {
        tenantId,
        introOfferEnabled: true,
        introOfferPrice: 49,
        introOfferMembershipId: subPkg.id,
        introOfferTimerHours: 72,
      },
    });
  }

  console.log("✅ intro_offer ready — sin paquetes, sin bookings");
  console.log("   → Precio intro: €49 vs normal €139 = ahorro €90");
  console.log("   → Timer: 72 horas");
  console.log("   ⚠️  Bookings cancelados temporalmente — usa 'reset' para restaurar");
}

async function main() {
  const scenario = process.argv[2];

  if (!scenario) {
    console.log("Uso: npx tsx scripts/test-conversion-scenarios.ts <scenario>");
    console.log("Escenarios: reset | booking | upgrade | intro | status");
    process.exit(1);
  }

  try {
    switch (scenario) {
      case "reset":
        await scenarioReset();
        break;
      case "booking":
        await scenarioBookingFlow();
        break;
      case "upgrade":
        await scenarioPackageUpgrade();
        break;
      case "intro":
        await scenarioIntroOffer();
        break;
      case "status":
        break;
      default:
        console.log(`❌ Escenario desconocido: ${scenario}`);
        process.exit(1);
    }

    await showStatus();
  } finally {
    await prisma.$disconnect();
  }
}

main();
