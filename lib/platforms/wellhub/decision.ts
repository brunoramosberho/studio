// Pure decision logic for accepting/rejecting a Wellhub booking request.
//
// Kept free of any I/O (no prisma, no fetch) so it is exhaustively unit
// testable. The transactional wrapper in bookings.ts feeds it live numbers and
// performs the atomic quota increment when this returns RESERVED.

import type { WellhubBookingRejectionReason, WellhubBookingStatus } from "./types";

export interface QuotaState {
  quotaSpots: number;
  bookedSpots: number;
  isClosedManually: boolean;
}

export interface ReservationDecision {
  status: WellhubBookingStatus;
  reason?: WellhubBookingRejectionReason;
}

/**
 * Decide whether a Wellhub booking can take a seat, enforcing BOTH gates:
 *   1. Platform quota cap   — bookedSpots < quotaSpots, and not closed.
 *   2. Physical room capacity — physicalSpotsLeft > 0 (shared across channels).
 *
 * Returns RESERVED only when both gates pass. The caller is responsible for the
 * atomic `bookedSpots` increment (race safety) after a RESERVED result.
 */
export function evaluateReservationDecision(args: {
  quota: QuotaState | null;
  physicalSpotsLeft: number;
}): ReservationDecision {
  const { quota, physicalSpotsLeft } = args;

  // No quota configured (or zero) → this platform may not take seats here.
  if (!quota || quota.quotaSpots <= 0) {
    return { status: "REJECTED", reason: "CLASS_IS_FULL" };
  }

  // Admin closed the platform allocation for this class.
  if (quota.isClosedManually) {
    return { status: "REJECTED", reason: "SPOT_NOT_AVAILABLE" };
  }

  // Physical room is full (counting Magic + blocked + all platforms).
  if (physicalSpotsLeft <= 0) {
    return { status: "REJECTED", reason: "CLASS_IS_FULL" };
  }

  // Platform quota cap reached.
  if (quota.bookedSpots >= quota.quotaSpots) {
    return { status: "REJECTED", reason: "CLASS_IS_FULL" };
  }

  return { status: "RESERVED" };
}
