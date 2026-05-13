/**
 * Read-only inventory of all Betoro-scoped data, grouped by "wipe candidate"
 * category. Helps decide the exact scope of a cleanup before going live.
 */
import { prisma } from "../lib/db";

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "betoro" },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error("Betoro tenant not found");
    process.exit(1);
  }
  console.log(`Tenant: ${tenant.name} (id=${tenant.id})\n`);

  const tid = tenant.id;

  // ── Financial / payments ──
  console.log("── Financial (Stripe customers, payments, packs, subs) ──");
  console.log("StripeCustomer:        ", await prisma.stripeCustomer.count({ where: { tenantId: tid } }));
  console.log("StripePayment:         ", await prisma.stripePayment.count({ where: { tenantId: tid } }));
  console.log("PosTransaction:        ", await prisma.posTransaction.count({ where: { tenantId: tid } }));
  console.log("UserPackage:           ", await prisma.userPackage.count({ where: { tenantId: tid } }));
  console.log("UserPackageCreditUsage:", await prisma.userPackageCreditUsage.count({ where: { userPackage: { tenantId: tid } } }));
  console.log("MemberSubscription:    ", await prisma.memberSubscription.count({ where: { tenantId: tid } }));
  console.log("Entitlement:           ", await prisma.entitlement.count({ where: { tenantId: tid } }));
  console.log("RevenueEvent:          ", await prisma.revenueEvent.count({ where: { tenantId: tid } }));
  console.log("PendingPenalty:        ", await prisma.pendingPenalty.count({ where: { tenantId: tid } }));
  console.log("Debt:                  ", await prisma.debt.count({ where: { tenantId: tid } }));
  console.log("DiscountRedemption:    ", await prisma.discountRedemption.count({ where: { discountCode: { tenantId: tid } } }));
  console.log("IntroOfferClaim:       ", await prisma.introOfferClaim.count({ where: { tenantId: tid } }));

  // ── Bookings / class consumption ──
  console.log("\n── Bookings / class consumption ──");
  console.log("Booking:               ", await prisma.booking.count({ where: { tenantId: tid } }));
  console.log("CheckIn:               ", await prisma.checkIn.count({ where: { class: { tenantId: tid } } }));
  console.log("Waitlist:              ", await prisma.waitlist.count({ where: { class: { tenantId: tid } } }));
  console.log("ClassSongRequest:      ", await prisma.classSongRequest.count({ where: { class: { tenantId: tid } } }));
  console.log("ClassNotifyMe:         ", await prisma.classNotifyMe.count({ where: { class: { tenantId: tid } } }));
  console.log("ClassBiometrics:       ", await prisma.classBiometrics.count({ where: { booking: { tenantId: tid } } }));
  console.log("PlatformBooking:       ", await prisma.platformBooking.count({ where: { tenantId: tid } }));

  // ── Schedule (configuration vs ephemeral) ──
  console.log("\n── Schedule (Classes) ──");
  const now = new Date();
  const futureClasses = await prisma.class.count({ where: { tenantId: tid, startsAt: { gt: now } } });
  const pastClasses = await prisma.class.count({ where: { tenantId: tid, startsAt: { lte: now } } });
  console.log(`Class (future):        `, futureClasses);
  console.log(`Class (past):          `, pastClasses);

  // ── Memberships / users ──
  console.log("\n── Memberships (per-tenant user links) ──");
  const membershipByRole = await prisma.membership.groupBy({
    by: ["role"],
    where: { tenantId: tid },
    _count: true,
  });
  for (const m of membershipByRole) {
    console.log(`  ${m.role.padEnd(12)}: ${m._count}`);
  }

  // ── Social ──
  console.log("\n── Social / gamification ──");
  console.log("FeedEvent:             ", await prisma.feedEvent.count({ where: { tenantId: tid } }));
  console.log("Friendship:            ", await prisma.friendship.count({ where: { tenantId: tid } }));
  console.log("MemberProgress:        ", await prisma.memberProgress.count({ where: { tenantId: tid } }));
  console.log("MemberAchievement:     ", await prisma.memberAchievement.count({ where: { tenantId: tid } }));
  console.log("MemberReward:          ", await prisma.memberReward.count({ where: { tenantId: tid } }));

  // ── Notifications ──
  console.log("\n── Notifications / marketing ──");
  console.log("Notification:          ", await prisma.notification.count({ where: { tenantId: tid } }));
  console.log("NudgeEvent:            ", await prisma.nudgeEvent.count({ where: { tenantId: tid } }));
  console.log("PushSubscription:      ", await prisma.pushSubscription.count({ where: { tenantId: tid } }));
  console.log("LinkClick:             ", await prisma.linkClick.count({ where: { tenantId: tid } }));
  console.log("LinkConversion:        ", await prisma.linkConversion.count({ where: { tenantId: tid } }));

  // ── Configuration (keep these) ──
  console.log("\n── Configuration (will NOT touch) ──");
  console.log("Studio:                ", await prisma.studio.count({ where: { tenantId: tid } }));
  console.log("Room:                  ", await prisma.room.count({ where: { studio: { tenantId: tid } } }));
  console.log("ClassType:             ", await prisma.classType.count({ where: { tenantId: tid } }));
  console.log("CoachProfile:          ", await prisma.coachProfile.count({ where: { tenantId: tid } }));
  console.log("Package (catalog):     ", await prisma.package.count({ where: { tenantId: tid } }));
  console.log("DiscountCode:          ", await prisma.discountCode.count({ where: { tenantId: tid } }));
  console.log("Waiver:                ", await prisma.waiver.count({ where: { tenantId: tid } }));
  console.log("Highlight:             ", await prisma.highlight.count({ where: { tenantId: tid } }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
