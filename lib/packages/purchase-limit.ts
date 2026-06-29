import { prisma } from "@/lib/db";

/**
 * Per-customer purchase cap enforcement.
 *
 * Returns a user-facing (Spanish) error string when `userId` has already
 * reached the package's `maxPurchasesPerCustomer` cap, or null when the
 * purchase is allowed — including when there is no cap (the common case).
 *
 * Only completed acquisitions count: ACTIVE and DISPUTED UserPackages.
 * PENDING_PAYMENT / PAYMENT_FAILED (never completed) and REVOKED (refunded or
 * charged back) are excluded, so an abandoned checkout or a refund doesn't
 * permanently use up the customer's allowance.
 */
export async function getPackagePurchaseLimitError(
  pkg: { id: string; maxPurchasesPerCustomer: number | null },
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const max = pkg.maxPurchasesPerCustomer;
  if (max == null || max < 1) return null;

  const owned = await prisma.userPackage.count({
    where: {
      userId,
      packageId: pkg.id,
      tenantId,
      status: { in: ["ACTIVE", "DISPUTED"] },
    },
  });

  if (owned < max) return null;

  return max === 1
    ? "Esta oferta es de un solo uso por cliente y ya la adquiriste."
    : `Esta oferta permite un máximo de ${max} compras por cliente y ya alcanzaste el límite.`;
}

/**
 * Batched version: of this tenant's capped packages, which has `userId` already
 * maxed out? Lets a catalog/picker mark them as unavailable up front (same
 * ACTIVE/DISPUTED counting as `getPackagePurchaseLimitError`).
 */
export async function getMaxedPackageIds(
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const capped = await prisma.package.findMany({
    where: { tenantId, isActive: true, maxPurchasesPerCustomer: { not: null } },
    select: { id: true, maxPurchasesPerCustomer: true },
  });
  if (capped.length === 0) return [];

  const owned = await prisma.userPackage.groupBy({
    by: ["packageId"],
    where: {
      userId,
      tenantId,
      packageId: { in: capped.map((p) => p.id) },
      status: { in: ["ACTIVE", "DISPUTED"] },
    },
    _count: true,
  });
  const counts = new Map(owned.map((o) => [o.packageId, o._count]));

  return capped
    .filter((p) => (counts.get(p.id) ?? 0) >= (p.maxPurchasesPerCustomer ?? Infinity))
    .map((p) => p.id);
}
