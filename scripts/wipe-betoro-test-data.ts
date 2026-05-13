/**
 * Wipe all Betoro test data accumulated during sandbox testing.
 *
 * KEEPS:
 *   - Tenant row + all its config (Studio, Room, ClassType, Package catalog,
 *     Waiver definitions, Highlights, OnDemandVideo catalog, ProductCategory/
 *     Product shop, conversion/analytics/gamification/referral configs, etc.).
 *   - 2 real ADMIN memberships (Bruno + Camila real).
 *   - 3 real COACH memberships + their CoachProfiles (Emma, Gloria, Mariana).
 *
 * WIPES (atomically — all-or-nothing):
 *   - All financial & booking records (StripePayments, StripeCustomers,
 *     PosTransactions, UserPackages, MemberSubscriptions, Entitlements,
 *     RevenueEvents, PendingPenalties, Debts, IntroOfferClaims, etc.).
 *   - All Bookings + all dependent records.
 *   - All Classes (past 274 + future 48 — all tied to fake coaches).
 *   - 3 fake CoachProfiles + their availability/pay-rate rows.
 *   - 49 CLIENT memberships + 3 fake COACH memberships.
 *   - All social/gamification/notification data for the tenant.
 */
import { prisma } from "../lib/db";

const TENANT_SLUG = "betoro";

const FAKE_COACH_PROFILE_IDS = [
  "cmnajurm1003dvbpikqkrxxec", // Camila Toro (valentina@flostudio.es)
  "cmnajurt9003jvbpi10ub6tuq", // Manuela Londoño (carolina@flostudio.es)
  "cmnajury8003pvbpiag8deza6", // Regina Cervantes (isabella@flostudio.es)
];

const FAKE_COACH_MEMBERSHIP_IDS = [
  "cmnajurpi003fvbpi304i192w",
  "cmnajurux003lvbpifawifl80",
  "cmnajurzw003rvbpiqhchv65c",
];

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { slug: TENANT_SLUG },
    select: { id: true, slug: true },
  });
  const tid = tenant.id;
  console.log(`Wiping test data for ${tenant.slug} (id=${tid})\n`);

  const result = await prisma.$transaction(
    async (tx) => {
      const r: Record<string, number> = {};

      // ── Revenue / accounting (leaves) ──
      r.revenueEvent = (await tx.revenueEvent.deleteMany({ where: { tenantId: tid } })).count;

      // ── Per-booking dependents ──
      r.classBiometrics = (
        await tx.classBiometrics.deleteMany({ where: { booking: { tenantId: tid } } })
      ).count;
      r.checkIn = (await tx.checkIn.deleteMany({ where: { tenantId: tid } })).count;
      r.pendingPenalty = (await tx.pendingPenalty.deleteMany({ where: { tenantId: tid } })).count;
      r.bookingProductOrder = (
        await tx.bookingProductOrder.deleteMany({ where: { tenantId: tid } })
      ).count;
      r.classRating = (await tx.classRating.deleteMany({ where: { tenantId: tid } })).count;

      // ── Per-class dependents ──
      r.classSongRequest = (await tx.classSongRequest.deleteMany({ where: { tenantId: tid } })).count;
      r.classPlaylistTrack = (
        await tx.classPlaylistTrack.deleteMany({ where: { class: { tenantId: tid } } })
      ).count;
      r.classNotifyMe = (await tx.classNotifyMe.deleteMany({ where: { tenantId: tid } })).count;
      r.waitlist = (await tx.waitlist.deleteMany({ where: { tenantId: tid } })).count;
      r.blockedSpot = (await tx.blockedSpot.deleteMany({ where: { tenantId: tid } })).count;
      r.substitutionRequest = (
        await tx.substitutionRequest.deleteMany({ where: { tenantId: tid } })
      ).count;

      // ── Partner platforms ──
      r.platformBooking = (await tx.platformBooking.deleteMany({ where: { tenantId: tid } })).count;
      r.platformAlert = (await tx.platformAlert.deleteMany({ where: { tenantId: tid } })).count;
      r.wellhubUserLink = (await tx.wellhubUserLink.deleteMany({ where: { tenantId: tid } })).count;

      // ── Bookings (guest children first via self-relation, then root) ──
      r.bookingChildren = (
        await tx.booking.deleteMany({ where: { tenantId: tid, parentBookingId: { not: null } } })
      ).count;
      r.bookingRoot = (await tx.booking.deleteMany({ where: { tenantId: tid } })).count;

      // ── Stripe-side records (these reference UserPackage/MemberSubscription) ──
      r.stripePayment = (await tx.stripePayment.deleteMany({ where: { tenantId: tid } })).count;
      r.posTransaction = (await tx.posTransaction.deleteMany({ where: { tenantId: tid } })).count;
      r.debt = (await tx.debt.deleteMany({ where: { tenantId: tid } })).count;
      r.discountRedemption = (
        await tx.discountRedemption.deleteMany({
          where: { discountCode: { tenantId: tid } },
        })
      ).count;
      r.userPackageCreditUsage = (
        await tx.userPackageCreditUsage.deleteMany({
          where: { userPackage: { tenantId: tid } },
        })
      ).count;

      // ── Entitlements / packs / subs (reference UserPackage / MemberSubscription) ──
      r.entitlement = (await tx.entitlement.deleteMany({ where: { tenantId: tid } })).count;
      r.userPackage = (await tx.userPackage.deleteMany({ where: { tenantId: tid } })).count;
      r.memberSubscription = (
        await tx.memberSubscription.deleteMany({ where: { tenantId: tid } })
      ).count;
      r.giftPackage = (await tx.giftPackage.deleteMany({ where: { tenantId: tid } })).count;

      // ── Customer-level Stripe + intro ──
      r.introOfferClaim = (await tx.introOfferClaim.deleteMany({ where: { tenantId: tid } })).count;
      r.stripeCustomer = (await tx.stripeCustomer.deleteMany({ where: { tenantId: tid } })).count;

      // ── Classes (all past + future) ──
      r.class = (await tx.class.deleteMany({ where: { tenantId: tid } })).count;

      // ── Fake coach availability + pay rates (before deleting CoachProfile) ──
      r.coachAvailabilityBlock = (
        await tx.coachAvailabilityBlock.deleteMany({
          where: { coachId: { in: FAKE_COACH_PROFILE_IDS } },
        })
      ).count;
      r.coachPayRate = (
        await tx.coachPayRate.deleteMany({
          where: { coachProfileId: { in: FAKE_COACH_PROFILE_IDS } },
        })
      ).count;
      r.coachProfile = (
        await tx.coachProfile.deleteMany({ where: { id: { in: FAKE_COACH_PROFILE_IDS } } })
      ).count;

      // ── Social / feed (delete children first) ──
      r.like = (await tx.like.deleteMany({ where: { feedEvent: { tenantId: tid } } })).count;
      r.comment = (await tx.comment.deleteMany({ where: { feedEvent: { tenantId: tid } } })).count;
      r.photo = (await tx.photo.deleteMany({ where: { feedEvent: { tenantId: tid } } })).count;
      r.pollVote = (
        await tx.pollVote.deleteMany({
          where: { poll: { feedEvent: { tenantId: tid } } },
        })
      ).count;
      r.pollOption = (
        await tx.pollOption.deleteMany({ where: { poll: { feedEvent: { tenantId: tid } } } })
      ).count;
      r.poll = (await tx.poll.deleteMany({ where: { feedEvent: { tenantId: tid } } })).count;
      r.feedEvent = (await tx.feedEvent.deleteMany({ where: { tenantId: tid } })).count;

      // ── Friendship / gamification ──
      r.friendship = (await tx.friendship.deleteMany({ where: { tenantId: tid } })).count;
      r.memberReward = (await tx.memberReward.deleteMany({ where: { tenantId: tid } })).count;
      r.memberAchievement = (
        await tx.memberAchievement.deleteMany({ where: { tenantId: tid } })
      ).count;
      r.memberProgress = (await tx.memberProgress.deleteMany({ where: { tenantId: tid } })).count;

      // ── Notifications / marketing ──
      r.notification = (await tx.notification.deleteMany({ where: { tenantId: tid } })).count;
      r.nudgeEvent = (await tx.nudgeEvent.deleteMany({ where: { tenantId: tid } })).count;
      r.pushSubscription = (await tx.pushSubscription.deleteMany({ where: { tenantId: tid } })).count;
      r.linkConversion = (await tx.linkConversion.deleteMany({ where: { tenantId: tid } })).count;
      r.linkClick = (await tx.linkClick.deleteMany({ where: { tenantId: tid } })).count;

      // ── Referral rewards ──
      r.referralReward = (await tx.referralReward.deleteMany({ where: { tenantId: tid } })).count;

      // ── On-demand streaming sessions ──
      r.onDemandStreamSession = (
        await tx.onDemandStreamSession.deleteMany({ where: { tenantId: tid } })
      ).count;

      // ── Admin feedback ──
      r.sparkFeatureRequest = (
        await tx.sparkFeatureRequest.deleteMany({ where: { tenantId: tid } })
      ).count;

      // ── Waiver signatures (keep Waiver definitions) ──
      r.waiverSignature = (await tx.waiverSignature.deleteMany({ where: { tenantId: tid } })).count;

      // ── Memberships: CLIENT + fake COACH ──
      r.membership = (
        await tx.membership.deleteMany({
          where: {
            tenantId: tid,
            OR: [{ role: "CLIENT" }, { id: { in: FAKE_COACH_MEMBERSHIP_IDS } }],
          },
        })
      ).count;

      return r;
    },
    { timeout: 60_000 },
  );

  console.log("── Deletion counts ──");
  for (const [k, v] of Object.entries(result)) {
    if (v > 0) console.log(`  ${k.padEnd(24)}: ${v}`);
  }
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  console.log(`\n  TOTAL ROWS DELETED: ${total}`);
}

main()
  .catch((e) => {
    console.error("Wipe failed (transaction rolled back):", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
