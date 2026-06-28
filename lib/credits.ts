import { prisma } from "@/lib/db";

/**
 * Shape returned by the query that loads user packages with allocation info.
 * Used by findPackageForClass and the booking/waitlist APIs.
 */
export interface UserPackageForBooking {
  id: string;
  creditsTotal: number | null;
  creditsUsed: number;
  expiresAt: Date;
  eligibleClassesFrom: Date | null;
  eligibleClassesUntil: Date | null;
  package: {
    classTypes: { id: string }[];
    creditAllocations: { classTypeId: string }[];
    maxBookingsPerDay: number | null;
    maxConcurrentUpcomingBookings: number | null;
    eligibleClassesFrom: Date | null;
    eligibleClassesUntil: Date | null;
  };
  creditUsages: {
    id: string;
    classTypeId: string;
    creditsTotal: number;
    creditsUsed: number;
  }[];
}

/** Prisma include clause to load everything needed for credit checks. */
export const userPackageIncludeForBooking = {
  package: {
    include: {
      classTypes: { select: { id: true } },
      creditAllocations: { select: { classTypeId: true } },
    },
  },
  creditUsages: {
    select: { id: true, classTypeId: true, creditsTotal: true, creditsUsed: true },
  },
} as const;

function isAllocationBased(pkg: UserPackageForBooking): boolean {
  return pkg.package.creditAllocations.length > 0;
}

function singlePoolHasCredits(pkg: UserPackageForBooking): boolean {
  return pkg.creditsTotal === null || pkg.creditsUsed < pkg.creditsTotal;
}

function singlePoolCoversClass(pkg: UserPackageForBooking, classTypeId: string): boolean {
  if (!pkg.package.classTypes.length) return true;
  return pkg.package.classTypes.some((ct) => ct.id === classTypeId);
}

function allocationHasCredits(pkg: UserPackageForBooking, classTypeId: string): boolean {
  const usage = pkg.creditUsages.find((u) => u.classTypeId === classTypeId);
  if (!usage) return false;
  return usage.creditsUsed < usage.creditsTotal;
}

/**
 * Whether a package may be used for a class on `classStartsAt`, honouring the
 * package's optional eligible-class date window (e.g. a free-class promo that
 * only works for a specific weekend). No window = usable for any date.
 */
export function classWithinPackageWindow(
  pkg: UserPackageForBooking,
  classStartsAt: Date,
): boolean {
  // Window stamped on the credit itself (e.g. from a promo-code redemption).
  if (pkg.eligibleClassesFrom && classStartsAt < pkg.eligibleClassesFrom) return false;
  if (pkg.eligibleClassesUntil && classStartsAt > pkg.eligibleClassesUntil) return false;
  // Window on the package (a dedicated promo package).
  const from = pkg.package.eligibleClassesFrom;
  const until = pkg.package.eligibleClassesUntil;
  if (from && classStartsAt < from) return false;
  if (until && classStartsAt > until) return false;
  return true;
}

/**
 * Whether a package has credits and covers the class type, ignoring any
 * eligible-class date window. Used to tell apart "no credits" from "credit
 * exists but is date-restricted" for clearer booking errors.
 */
export function packageCoversClassType(
  pkg: UserPackageForBooking,
  classTypeId: string,
): boolean {
  return packageCanBook(pkg, classTypeId);
}

function packageCanBook(
  pkg: UserPackageForBooking,
  classTypeId: string,
  classStartsAt?: Date,
): boolean {
  if (classStartsAt && !classWithinPackageWindow(pkg, classStartsAt)) {
    return false;
  }
  if (isAllocationBased(pkg)) {
    return allocationHasCredits(pkg, classTypeId);
  }
  return singlePoolHasCredits(pkg) && singlePoolCoversClass(pkg, classTypeId);
}

/**
 * Find the best UserPackage that can cover a booking for the given class type.
 * Prefers `preferredId` if it qualifies, otherwise picks the first valid one
 * (sorted by expiresAt asc — caller should pre-sort). When `classStartsAt` is
 * passed, packages whose eligible-class window excludes that date are skipped.
 */
export function findPackageForClass(
  userPackages: UserPackageForBooking[],
  classTypeId: string,
  preferredId?: string | null,
  classStartsAt?: Date,
): UserPackageForBooking | null {
  if (preferredId) {
    const preferred = userPackages.find(
      (p) => p.id === preferredId && packageCanBook(p, classTypeId, classStartsAt),
    );
    if (preferred) return preferred;
  }

  return (
    userPackages.find((p) => packageCanBook(p, classTypeId, classStartsAt)) ?? null
  );
}

/**
 * Deduct one credit from the correct counter (allocation row or single pool).
 */
export async function deductCredit(
  userPackageId: string,
  classTypeId: string,
): Promise<void> {
  const pkg = await prisma.userPackage.findUnique({
    where: { id: userPackageId },
    include: {
      package: { include: { creditAllocations: { select: { classTypeId: true } } } },
      creditUsages: { select: { id: true, classTypeId: true } },
    },
  });

  if (!pkg) return;

  if (pkg.package.creditAllocations.length > 0) {
    const usage = pkg.creditUsages.find((u) => u.classTypeId === classTypeId);
    if (usage) {
      await prisma.userPackageCreditUsage.update({
        where: { id: usage.id },
        data: { creditsUsed: { increment: 1 } },
      });
    }
  } else {
    await prisma.userPackage.update({
      where: { id: userPackageId },
      data: { creditsUsed: { increment: 1 } },
    });
  }
}

/**
 * A member marked no-show later turns out to have attended (front desk checks
 * them in / an admin corrects the status). The class credit must end up
 * consumed, exactly like a normal attendance — the credit was deducted at
 * booking, so:
 *  - a strict no-show kept it consumed (creditLost) → keep it, just clear the
 *    "forfeited" flag (it now pays for the attended class);
 *  - a lenient no-show refunded it (creditLost = false) → re-consume it.
 * Unlimited packs never consume a credit, so they are left untouched. The
 * monetary fee (the pending penalty) is reverted separately by the caller.
 */
export async function reconcileCreditOnLateAttendance(args: {
  bookingId: string;
  packageUsed: string | null;
  creditLost: boolean;
  classTypeId: string;
}): Promise<void> {
  const { bookingId, packageUsed, creditLost, classTypeId } = args;
  if (!packageUsed) return;

  if (creditLost) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { creditLost: false },
    });
    return;
  }

  const pkg = await prisma.userPackage.findUnique({
    where: { id: packageUsed },
    select: { creditsTotal: true },
  });
  if (pkg && pkg.creditsTotal !== null) {
    await deductCredit(packageUsed, classTypeId);
  }
}

/**
 * Restore one credit to the correct counter (allocation row or single pool).
 */
export async function restoreCredit(
  userPackageId: string,
  classTypeId: string,
): Promise<void> {
  const pkg = await prisma.userPackage.findUnique({
    where: { id: userPackageId },
    include: {
      package: { include: { creditAllocations: { select: { classTypeId: true } } } },
      creditUsages: { select: { id: true, classTypeId: true } },
    },
  });

  if (!pkg) return;

  if (pkg.package.creditAllocations.length > 0) {
    const usage = pkg.creditUsages.find((u) => u.classTypeId === classTypeId);
    if (usage) {
      await prisma.userPackageCreditUsage.update({
        where: { id: usage.id },
        data: { creditsUsed: { decrement: 1 } },
      });
    }
  } else {
    await prisma.userPackage.update({
      where: { id: userPackageId },
      data: { creditsUsed: { decrement: 1 } },
    });
  }
}

/**
 * Heal subscription-backed booking access.
 *
 * An active membership (MemberSubscription) is only bookable once the
 * `invoice.paid` Stripe webhook has materialised a UserPackage for the current
 * period (see stripe-connect webhook). If that webhook is delayed, dropped, or
 * the subscription was created out-of-band, the member's membership shows as
 * "no credits" and booking is blocked even though they've paid.
 *
 * This ensures every ACTIVE/trialing MemberSubscription for (userId, tenantId)
 * whose current period is still valid has a usable UserPackage, mirroring what
 * the webhook would have created. Idempotent: it only creates a UserPackage
 * when none currently covers the period, so it's safe to call on every
 * credit-check path. On-demand subscriptions are skipped (they intentionally
 * have no class-credit UserPackage).
 */
export async function ensureSubscriptionUserPackages(
  userId: string,
  tenantId: string,
): Promise<void> {
  const now = new Date();
  const subs = await prisma.memberSubscription.findMany({
    where: {
      userId,
      tenantId,
      status: { in: ["active", "trialing"] },
      currentPeriodEnd: { gt: now },
    },
    include: {
      package: {
        select: {
          type: true,
          credits: true,
          creditAllocations: { select: { id: true } },
        },
      },
    },
  });

  for (const sub of subs) {
    if (sub.package.type === "ON_DEMAND_SUBSCRIPTION") continue;

    const existing = await prisma.userPackage.findFirst({
      where: {
        userId,
        tenantId,
        packageId: sub.packageId,
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (existing) continue;

    const hasAllocations = sub.package.creditAllocations.length > 0;
    const created = await prisma.userPackage.create({
      data: {
        tenantId,
        userId,
        packageId: sub.packageId,
        creditsTotal: hasAllocations ? null : sub.package.credits,
        creditsUsed: 0,
        expiresAt: sub.currentPeriodEnd,
        status: "ACTIVE",
      },
    });
    if (hasAllocations) {
      await createCreditUsagesForPackage(created.id, sub.packageId);
    }
  }
}

/**
 * Create UserPackageCreditUsage rows when a package with allocations is purchased.
 * Called from purchase route and stripe webhook.
 */
export async function createCreditUsagesForPackage(
  userPackageId: string,
  packageId: string,
): Promise<void> {
  const allocations = await prisma.packageCreditAllocation.findMany({
    where: { packageId },
  });

  if (allocations.length === 0) return;

  await prisma.userPackageCreditUsage.createMany({
    data: allocations.map((a) => ({
      userPackageId,
      classTypeId: a.classTypeId,
      creditsTotal: a.credits,
      creditsUsed: 0,
    })),
  });
}
