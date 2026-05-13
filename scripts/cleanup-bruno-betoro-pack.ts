/**
 * Remove brunoramosberho@gmail.com's accidental Intro Offer purchase in Betoro
 * tenant and all linked records (Entitlement, Booking, StripePayment, etc.).
 * Atomic transaction.
 */
import { prisma } from "../lib/db";

const USER_EMAIL = "brunoramosberho@gmail.com";
const TENANT_SLUG = "betoro";

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: USER_EMAIL },
    select: { id: true },
  });
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  });
  const userId = user.id;
  const tenantId = tenant.id;

  console.log(`Cleaning ${USER_EMAIL} on tenant ${TENANT_SLUG}\n`);

  // Pre-scan: report what we're about to touch (including any Stripe payment
  // intent IDs in case a real charge needs a manual refund afterwards).
  const payments = await prisma.stripePayment.findMany({
    where: { memberId: userId, tenantId },
    select: { id: true, stripePaymentIntentId: true, amount: true, currency: true, status: true, type: true },
  });
  if (payments.length > 0) {
    console.log("⚠️  Stripe payments found — refund manually in Stripe Dashboard if needed:");
    for (const p of payments) {
      console.log(`  ${p.stripePaymentIntentId} | ${p.amount} ${p.currency} | ${p.type} | ${p.status}`);
    }
    console.log("");
  }

  const result = await prisma.$transaction(async (tx) => {
    const r: Record<string, number> = {};

    // Look up the UserPackage(s) for this user in this tenant
    const packs = await tx.userPackage.findMany({
      where: { userId, tenantId },
      select: { id: true },
    });
    const packIds = packs.map((p) => p.id);

    r.discountRedemption = (
      await tx.discountRedemption.deleteMany({
        where: { userPackageId: { in: packIds } },
      })
    ).count;
    r.userPackageCreditUsage = (
      await tx.userPackageCreditUsage.deleteMany({
        where: { userPackageId: { in: packIds } },
      })
    ).count;

    // Revenue events linked to entitlements in this scope
    r.revenueEvent = (
      await tx.revenueEvent.deleteMany({
        where: { tenantId, entitlement: { userId } },
      })
    ).count;

    // Bookings sourced from entitlements in this scope
    r.booking = (
      await tx.booking.deleteMany({
        where: { tenantId, userId, sourceEntitlement: { userId } },
      })
    ).count;

    // Entitlements linked to user
    r.entitlement = (
      await tx.entitlement.deleteMany({ where: { tenantId, userId } })
    ).count;

    // UserPackages
    r.userPackage = (
      await tx.userPackage.deleteMany({ where: { id: { in: packIds } } })
    ).count;

    // Other purchase-side state
    r.stripePayment = (
      await tx.stripePayment.deleteMany({ where: { memberId: userId, tenantId } })
    ).count;
    r.introOfferClaim = (
      await tx.introOfferClaim.deleteMany({ where: { userId, tenantId } })
    ).count;
    r.nudgeEvent = (
      await tx.nudgeEvent.deleteMany({ where: { userId, tenantId } })
    ).count;
    r.stripeCustomer = (
      await tx.stripeCustomer.deleteMany({ where: { memberId: userId, tenantId } })
    ).count;
    r.notification = (
      await tx.notification.deleteMany({ where: { userId, tenantId } })
    ).count;
    r.memberAchievement = (
      await tx.memberAchievement.deleteMany({ where: { userId, tenantId } })
    ).count;
    r.memberReward = (
      await tx.memberReward.deleteMany({ where: { userId, tenantId } })
    ).count;
    r.memberProgress = (
      await tx.memberProgress.deleteMany({ where: { userId, tenantId } })
    ).count;

    return r;
  });

  console.log("── Deletion counts ──");
  for (const [k, v] of Object.entries(result)) {
    if (v > 0) console.log(`  ${k.padEnd(24)}: ${v}`);
  }
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  console.log(`\n  TOTAL: ${total}`);

  if (payments.length > 0) {
    console.log("\n👉 Remember to refund the Stripe charge(s) above in the Dashboard.");
  }
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
