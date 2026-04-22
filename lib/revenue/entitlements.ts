import { prisma } from "@/lib/db";
import { toStripeAmount } from "@/lib/stripe/helpers";
import type {
  Entitlement,
  EntitlementStatus,
  EntitlementType,
  MemberSubscription,
  Package,
  UserPackage,
} from "@prisma/client";

// Maps existing UserPackage / MemberSubscription rows into Entitlement rows.
// Kept here so the booking and subscription flows can call this inline (future
// work) and the backfill script shares the same mapping logic.

type MinimalUserPackage = UserPackage & { package: Package };
type MinimalSubscription = MemberSubscription & { package: Package };

export function entitlementStatusFromPack(
  up: MinimalUserPackage,
  now: Date = new Date(),
): EntitlementStatus {
  if (up.expiresAt <= now) return "expired";
  if (up.creditsTotal != null && up.creditsUsed >= up.creditsTotal) return "exhausted";
  return "active";
}

export function entitlementStatusFromSubscription(
  sub: MinimalSubscription,
  now: Date = new Date(),
): EntitlementStatus {
  if (sub.status === "canceled") return "cancelled";
  if (sub.currentPeriodEnd < now) return "expired";
  return "active";
}

export function entitlementTypeFromPackage(pkg: Package): EntitlementType {
  if (pkg.type === "SUBSCRIPTION") return "unlimited";
  // OFFER/PACK both behave as packs (credit buckets with expiration)
  return "pack";
}

/**
 * Idempotent: resolves or creates the Entitlement row that accounts for a
 * UserPackage. Linked 1-1 via Entitlement.userPackageId.
 */
export async function ensureEntitlementForUserPackage(
  userPackageId: string,
): Promise<Entitlement> {
  const existing = await prisma.entitlement.findUnique({
    where: { userPackageId },
  });
  if (existing) return existing;

  const up = await prisma.userPackage.findUniqueOrThrow({
    where: { id: userPackageId },
    include: { package: true },
  });

  const type = entitlementTypeFromPackage(up.package);
  const status = entitlementStatusFromPack(up);

  return prisma.entitlement.create({
    data: {
      tenantId: up.tenantId,
      userId: up.userId,
      packageId: up.packageId,
      userPackageId: up.id,
      type,
      status,
      totalAmountCents: toStripeAmount(up.package.price),
      currency: up.package.currency.toLowerCase(),
      creditsTotal: up.creditsTotal ?? up.package.credits ?? null,
      creditsUsed: up.creditsUsed,
      periodStart: up.purchasedAt,
      periodEnd: up.expiresAt,
      purchasedAt: up.purchasedAt,
    },
  });
}

/**
 * Resolves or creates the Entitlement for a MemberSubscription's current
 * billing period. One entitlement per (subscription × period), so a
 * subscription that renews produces a fresh entitlement each cycle.
 */
export async function ensureEntitlementForSubscriptionPeriod(
  memberSubscriptionId: string,
): Promise<Entitlement> {
  const sub = await prisma.memberSubscription.findUniqueOrThrow({
    where: { id: memberSubscriptionId },
    include: { package: true },
  });

  const existing = await prisma.entitlement.findFirst({
    where: {
      memberSubscriptionId,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    },
  });
  if (existing) return existing;

  return prisma.entitlement.create({
    data: {
      tenantId: sub.tenantId,
      userId: sub.userId,
      packageId: sub.packageId,
      memberSubscriptionId: sub.id,
      type: "unlimited",
      status: entitlementStatusFromSubscription(sub),
      totalAmountCents: toStripeAmount(sub.package.price),
      currency: sub.package.currency.toLowerCase(),
      creditsTotal: null,
      creditsUsed: 0,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      purchasedAt: sub.createdAt,
    },
  });
}
