import { prisma } from "@/lib/db";
import { addHours } from "date-fns";
import type { NudgeType, Package } from "@prisma/client";

// ── Types ──

export interface BookingFlowData {
  classesBoughtThisMonth: number;
  totalSpentThisMonth: number;
  membershipPrice: number;
  breakEvenClasses: number;
  savingsIfMember: number | null; // null = no real savings yet
  classesToBreakEven: number;
  memberships: MembershipOption[];
  featuredMembershipId: string | null;
}

export interface IntroOfferData {
  introPrice: number;
  normalPrice: number;
  saving: number;
  expiresAt: Date;
  membershipId: string | null;
  isReturning?: boolean;
}

export interface PackageUpgradeData {
  classesRemaining: number;
  creditAmount: number;
  upgradePrice: number;
  memberships: MembershipOption[];
}

export interface MembershipOption {
  id: string;
  name: string;
  price: number;
  currency: string;
  credits: number | null;
  validDays: number;
  description: string | null;
}

export type NudgeDecision =
  | { type: "none" }
  | { type: "booking_flow"; data: BookingFlowData }
  | { type: "intro_offer"; data: IntroOfferData }
  | { type: "savings_email" }
  | { type: "package_upgrade"; data: PackageUpgradeData };

type NudgeContext = "booking" | "post_booking" | "email_check";

// ── Main decision function ──

export async function getNudgeDecision(
  userId: string,
  tenantId: string,
  context: NudgeContext,
): Promise<NudgeDecision> {
  const [config, member] = await Promise.all([
    getConversionConfig(tenantId),
    getMemberContext(userId, tenantId),
  ]);

  // RULE 1: Active subscription → never show anything
  if (member.activeSubscription) return { type: "none" };

  // RULE 2: Anti-spam — saw a nudge in the last 7 days
  if (context === "booking") {
    const recentNudge = await getRecentNudge(userId, tenantId, 7);
    if (recentNudge) return { type: "none" };
  }

  // RULE 3: Has active package with credits
  if (member.activePackage) {
    const remaining =
      (member.activePackage.creditsTotal ?? 0) -
      member.activePackage.creditsUsed;

    if (remaining > config.packageUpgradeTrigger) return { type: "none" };

    if (
      config.packageUpgradeEnabled &&
      remaining <= config.packageUpgradeTrigger
    ) {
      const timing = config.packageUpgradeTiming;
      if (
        (context === "booking" && timing === "pre_booking") ||
        (context === "post_booking" && timing === "post_booking")
      ) {
        const pricePerClass =
          member.activePackage.package.price /
          (member.activePackage.creditsTotal ?? 1);
        const credit = config.packageUpgradeCredit
          ? Math.round(pricePerClass * remaining * 100) / 100
          : 0;

        return {
          type: "package_upgrade",
          data: {
            classesRemaining: remaining,
            creditAmount: credit,
            upgradePrice: pricePerClass * remaining,
            memberships: await getAvailableMemberships(tenantId),
          },
        };
      }
    }
    return { type: "none" };
  }

  // No subscription, no package — evaluate nudge type

  const isFirstPurchase = member.bookingCount === 0;

  // First-time visitor → Intro Offer
  if (isFirstPurchase && config.introOfferEnabled && context === "booking") {
    const existingOffer = await getIntroOfferClaim(userId, tenantId);

    if (!existingOffer) {
      const normalPrice = await getMembershipPrice(
        config.introOfferMembershipId,
        tenantId,
      );
      return {
        type: "intro_offer",
        data: {
          introPrice: config.introOfferPrice,
          normalPrice,
          saving: normalPrice - config.introOfferPrice,
          expiresAt: addHours(new Date(), config.introOfferTimerHours),
          membershipId: config.introOfferMembershipId,
        },
      };
    }

    if (existingOffer.rejectedAt) return { type: "none" };

    if (!existingOffer.acceptedAt) {
      return {
        type: "intro_offer",
        data: {
          introPrice: existingOffer.introPrice,
          normalPrice: existingOffer.normalPrice,
          saving: existingOffer.normalPrice - existingOffer.introPrice,
          expiresAt: existingOffer.expiresAt,
          membershipId: config.introOfferMembershipId,
          isReturning: true,
        },
      };
    }
  }

  // Not first time → evaluate monthly drop-in history (booking_flow nudge)
  if (config.showInBookingFlow && context === "booking") {
    const [monthlyClasses, avgClassPrice, membershipPrice] = await Promise.all([
      getMonthlyPurchasedClasses(userId, tenantId),
      getAverageClassPrice(tenantId),
      getMembershipPrice(config.featuredMembershipId, tenantId),
    ]);

    const totalSpent = monthlyClasses * avgClassPrice;
    const breakEvenClasses =
      avgClassPrice > 0 ? Math.ceil(membershipPrice / avgClassPrice) : 0;

    return {
      type: "booking_flow",
      data: {
        classesBoughtThisMonth: monthlyClasses,
        totalSpentThisMonth: totalSpent,
        membershipPrice,
        breakEvenClasses,
        // Only show savings if REAL and positive
        savingsIfMember:
          totalSpent > membershipPrice ? totalSpent - membershipPrice : null,
        classesToBreakEven: Math.max(0, breakEvenClasses - monthlyClasses),
        memberships: await getAvailableMemberships(tenantId),
        featuredMembershipId: config.featuredMembershipId,
      },
    };
  }

  return { type: "none" };
}

// ── Helper: get or create conversion config ──

export async function getConversionConfig(tenantId: string) {
  const existing = await prisma.membershipConversionConfig.findUnique({
    where: { tenantId },
  });
  if (existing) return existing;

  return prisma.membershipConversionConfig.create({
    data: { tenantId },
  });
}

// ── Helper: member context ──

interface MemberContext {
  activeSubscription: { id: string; packageId: string } | null;
  activePackage: {
    id: string;
    creditsTotal: number | null;
    creditsUsed: number;
    package: { price: number; credits: number | null };
  } | null;
  bookingCount: number;
}

async function getMemberContext(
  userId: string,
  tenantId: string,
): Promise<MemberContext> {
  const now = new Date();

  const [subscription, activePack, bookingCount] = await Promise.all([
    prisma.userPackage.findFirst({
      where: {
        userId,
        tenantId,
        package: { type: "SUBSCRIPTION" },
        expiresAt: { gt: now },
      },
      select: { id: true, packageId: true },
    }),
    prisma.userPackage.findFirst({
      where: {
        userId,
        tenantId,
        package: { type: { in: ["PACK", "OFFER"] } },
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        creditsTotal: true,
        creditsUsed: true,
        package: { select: { price: true, credits: true } },
      },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.booking.count({
      where: { userId, tenantId, status: { not: "CANCELLED" } },
    }),
  ]);

  return {
    activeSubscription: subscription,
    activePackage: activePack,
    bookingCount,
  };
}

// ── Helper: anti-spam check ──

async function getRecentNudge(
  userId: string,
  tenantId: string,
  days: number,
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.nudgeEvent.findFirst({
    where: {
      userId,
      tenantId,
      shown: true,
      shownAt: { gte: since },
    },
    orderBy: { shownAt: "desc" },
  });
}

// ── Helper: intro offer claim ──

async function getIntroOfferClaim(userId: string, tenantId: string) {
  return prisma.introOfferClaim.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
}

// ── Helper: membership price ──

async function getMembershipPrice(
  membershipId: string | null,
  tenantId: string,
): Promise<number> {
  if (membershipId) {
    const pkg = await prisma.package.findUnique({
      where: { id: membershipId },
      select: { price: true },
    });
    if (pkg) return pkg.price;
  }

  const cheapest = await prisma.package.findFirst({
    where: { tenantId, type: "SUBSCRIPTION", isActive: true },
    orderBy: { price: "asc" },
    select: { price: true },
  });

  return cheapest?.price ?? 0;
}

// ── Helper: available memberships (subscriptions) ──

async function getAvailableMemberships(
  tenantId: string,
): Promise<MembershipOption[]> {
  const packages = await prisma.package.findMany({
    where: { tenantId, type: "SUBSCRIPTION", isActive: true },
    orderBy: { price: "asc" },
    select: {
      id: true,
      name: true,
      price: true,
      currency: true,
      credits: true,
      validDays: true,
      description: true,
    },
  });

  return packages;
}

// ── Helper: monthly drop-in classes this month ──

async function getMonthlyPurchasedClasses(
  userId: string,
  tenantId: string,
): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return prisma.booking.count({
    where: {
      userId,
      tenantId,
      status: { not: "CANCELLED" },
      createdAt: { gte: startOfMonth },
    },
  });
}

// ── Helper: average class price for the tenant ──

async function getAverageClassPrice(tenantId: string): Promise<number> {
  const packs = await prisma.package.findMany({
    where: {
      tenantId,
      type: { in: ["PACK", "OFFER"] },
      isActive: true,
      credits: { not: null },
    },
    select: { price: true, credits: true },
  });

  if (packs.length === 0) return 0;

  const total = packs.reduce((sum, p) => {
    const perClass = p.credits ? p.price / p.credits : 0;
    return sum + perClass;
  }, 0);

  return Math.round((total / packs.length) * 100) / 100;
}

// ── Helper: calculate package credit ──

export function calculatePackageCredit(
  originalPrice: number,
  totalClasses: number,
  classesRemaining: number,
): number {
  const pricePerClass = originalPrice / totalClasses;
  return Math.round(pricePerClass * classesRemaining * 100) / 100;
}
