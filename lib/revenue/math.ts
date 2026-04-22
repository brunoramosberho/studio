// Pure, framework-agnostic math for revenue recognition.
//
// These functions take primitives and return primitives so they're trivially
// unit-testable without a DB. All inputs are integer cents; rounding uses
// Math.floor for allocations (with the residual captured as breakage) so we
// never over-recognize beyond the monthly bucket.

import type {
  AllocationResult,
  BookingForAllocation,
  Cents,
  MonthlyCloseAllocation,
} from "./types";

/**
 * Inclusive day count between two dates (Jan 15 → Feb 14 = 31 days).
 * Documented convention: both endpoints are inclusive. Applied consistently
 * across daily accrual and period-cap math.
 */
export function daysInPeriodInclusive(periodStart: Date, periodEnd: Date): number {
  const ms = periodEnd.getTime() - periodStart.getTime();
  // +1 because both endpoints count as days of service
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/**
 * Daily pro-rata amount for an unlimited subscription. Uses Math.floor so
 * the sum of daily accruals never exceeds the total paid; any rounding
 * residual surfaces as monthly_breakage at month close.
 */
export function dailyAccrualCents(
  totalAmountCents: Cents,
  periodStart: Date,
  periodEnd: Date,
): Cents {
  const days = daysInPeriodInclusive(periodStart, periodEnd);
  return Math.floor(totalAmountCents / days);
}

/**
 * Per-credit value for a pack. Integer division; remainder stays attached to
 * the pack until closeout (either full consumption or expiration breakage).
 */
export function perCreditCents(totalAmountCents: Cents, creditsTotal: number): Cents {
  if (creditsTotal <= 0) return 0;
  return Math.floor(totalAmountCents / creditsTotal);
}

/**
 * Monthly close allocation for an unlimited entitlement.
 *
 * Distributes `monthlyBucketCents` across attended bookings proportionally by
 * ClassType.revenueWeight, capped per booking at ClassType.dropInPriceCents.
 * Residual = monthly_breakage (last day of month).
 *
 * Algorithm:
 *   sum_of_weights = Σ booking.weight
 *   base_rate      = monthly_bucket / sum_of_weights
 *   per_booking    = min(base_rate × booking.weight, dropInPriceCents ?? ∞)
 *
 * Edge cases handled:
 *   - zero bookings → entire bucket is breakage
 *   - sum_of_weights = 0 (all weights zero) → entire bucket is breakage
 *   - every booking caps out → leftover cents become breakage
 *   - rounding residual (floor) → breakage absorbs it
 */
export function allocateUnlimitedMonthly(
  entitlementId: string,
  monthlyBucketCents: Cents,
  bookings: BookingForAllocation[],
): MonthlyCloseAllocation {
  if (bookings.length === 0 || monthlyBucketCents <= 0) {
    return {
      entitlementId,
      monthlyBucketCents,
      allocations: [],
      monthlyBreakageCents: Math.max(0, monthlyBucketCents),
    };
  }

  const sumOfWeights = bookings.reduce((s, b) => s + b.weight, 0);
  if (sumOfWeights <= 0) {
    return {
      entitlementId,
      monthlyBucketCents,
      allocations: [],
      monthlyBreakageCents: monthlyBucketCents,
    };
  }

  const baseRatePerWeight = monthlyBucketCents / sumOfWeights;

  const allocations: AllocationResult[] = bookings.map((b) => {
    const raw = Math.floor(baseRatePerWeight * b.weight);
    const cap = b.dropInPriceCents ?? Number.POSITIVE_INFINITY;
    const capped = Math.min(raw, cap);
    return {
      bookingId: b.id,
      amountCents: capped,
      weight: b.weight,
      rawCents: raw,
      wasCapped: raw > cap,
    };
  });

  const totalAllocated = allocations.reduce((s, a) => s + a.amountCents, 0);
  const monthlyBreakageCents = Math.max(0, monthlyBucketCents - totalAllocated);

  return { entitlementId, monthlyBucketCents, allocations, monthlyBreakageCents };
}

/**
 * Expiration breakage for a pack: remaining credits × per-credit value.
 * Returns 0 when the pack was fully consumed.
 */
export function packExpirationBreakageCents(
  totalAmountCents: Cents,
  creditsTotal: number,
  creditsUsed: number,
): Cents {
  const remaining = Math.max(0, creditsTotal - creditsUsed);
  if (remaining === 0) return 0;
  return perCreditCents(totalAmountCents, creditsTotal) * remaining;
}

/**
 * Last calendar day of the month that contains `date`.
 * Used as the event_date for monthly_breakage (product-confirmed convention).
 */
export function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 0, 0, 0, 0);
}

/**
 * Inclusive [start, end] bounds for a calendar month from "YYYY-MM".
 */
export function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}
