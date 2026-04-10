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
  package: {
    classTypes: { id: string }[];
    creditAllocations: { classTypeId: string }[];
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

function packageCanBook(pkg: UserPackageForBooking, classTypeId: string): boolean {
  if (isAllocationBased(pkg)) {
    return allocationHasCredits(pkg, classTypeId);
  }
  return singlePoolHasCredits(pkg) && singlePoolCoversClass(pkg, classTypeId);
}

/**
 * Find the best UserPackage that can cover a booking for the given class type.
 * Prefers `preferredId` if it qualifies, otherwise picks the first valid one
 * (sorted by expiresAt asc — caller should pre-sort).
 */
export function findPackageForClass(
  userPackages: UserPackageForBooking[],
  classTypeId: string,
  preferredId?: string | null,
): UserPackageForBooking | null {
  if (preferredId) {
    const preferred = userPackages.find(
      (p) => p.id === preferredId && packageCanBook(p, classTypeId),
    );
    if (preferred) return preferred;
  }

  return userPackages.find((p) => packageCanBook(p, classTypeId)) ?? null;
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
