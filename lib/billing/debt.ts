import { prisma } from "@/lib/db";

/**
 * Check whether the user has any OPEN debts in this tenant. Callers should
 * block new purchases/bookings when this returns true.
 */
export async function userHasOpenDebt(
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const count = await prisma.debt.count({
    where: { userId, tenantId, status: "OPEN" },
  });
  return count > 0;
}

/**
 * Compute the amount the user owes the studio for a package they already
 * consumed before disputing/refunding.
 *
 * - For credit-based packages with a fixed credits total and price, we charge
 *   proportionally: (creditsUsed / credits) * price.
 * - For unlimited (credits === null) or allocation-based packages, we fall back
 *   to the disputed/refunded amount as a best-effort proxy — the admin can
 *   adjust via the debt notes if needed.
 */
export function computeDebtAmount(input: {
  creditsUsed: number;
  packageCredits: number | null;
  packagePrice: number;
  hasAllocations: boolean;
  chargedAmount: number;
}): number {
  const { creditsUsed, packageCredits, packagePrice, hasAllocations, chargedAmount } = input;

  if (!hasAllocations && packageCredits && packageCredits > 0 && packagePrice > 0) {
    const unit = packagePrice / packageCredits;
    const owed = Math.min(creditsUsed, packageCredits) * unit;
    return Math.round(owed * 100) / 100;
  }

  return Math.round(chargedAmount * 100) / 100;
}
