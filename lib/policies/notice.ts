/**
 * Turns a cancellation policy into the clauses a member-facing notice needs.
 *
 * Cancelling late and not showing up are modelled as two separate events,
 * because they genuinely differ: a member on a pack forfeits their credit for
 * both, but only the no-show carries the fee. Collapsing them into one sentence
 * — "late cancellations or no-shows are charged $200" — overstates the penalty
 * for every late cancel FDV has ever had.
 *
 * These mirror `resolveNoShowPenalty` and `resolveCancellationPolicy`
 * deliberately: a notice that disagrees with the code is worse than none.
 *
 * Clauses come back as data rather than a string so the wording stays in the
 * message catalogue and gets translated like everything else.
 */

/** Tenant-level policy — what the class page knows before a plan is chosen. */
export interface NoticePolicy {
  cancellationWindowHours: number;
  noShowPenaltyEnabled: boolean;
  noShowLoseCredit: boolean;
  noShowChargeFee: boolean;
  /** Fee for members on a pack, in currency units (not cents). */
  noShowPenaltyAmount: number | null;
  /** Fee for members on unlimited; falls back to the pack amount when null. */
  noShowFeeAmountUnlimited: number | null;
  /**
   * Highest late-cancel fee across the studio's active packages, in currency
   * units. Late-cancel fees live on the package and only ever apply to
   * unlimited members, so before a plan is picked this is the ceiling, not a
   * price anyone is guaranteed to pay.
   */
  maxLateCancelFee?: number | null;
}

export interface EventConsequence {
  /** The booking's class credit is consumed. */
  losesCredit: boolean;
  /** Amount charged, in currency units, or null when nothing is charged. */
  fee: number | null;
  /** The amount depends on the member's plan, so the notice must say "up to". */
  feeVaries: boolean;
}

export interface NoticeClauses {
  windowHours: number;
  lateCancel: EventConsequence;
  noShow: EventConsequence;
}

/** True when both events can be described by a single sentence. */
export function sameConsequence(a: EventConsequence, b: EventConsequence): boolean {
  return a.losesCredit === b.losesCredit && a.fee === b.fee && a.feeVaries === b.feeVaries;
}

/** True when the event carries no consequence at all. */
export function isFree(c: EventConsequence): boolean {
  return !c.losesCredit && c.fee == null;
}

function normaliseHours(hours: number | null | undefined): number {
  return Math.max(0, Math.round(hours ?? 0));
}

/**
 * The studio's general policy, for surfaces that don't know which plan the
 * member will use — the class page before booking.
 */
export function policyClauses(policy: NoticePolicy): NoticeClauses {
  const windowHours = normaliseHours(policy.cancellationWindowHours);

  // A late cancel outside the window keeps the credit spent, whatever the
  // penalty switch says: it was consumed when the booking was made.
  const lateCancelFee = policy.maxLateCancelFee && policy.maxLateCancelFee > 0
    ? policy.maxLateCancelFee
    : null;
  const lateCancel: EventConsequence = {
    losesCredit: true,
    fee: lateCancelFee,
    // Only unlimited plans carry a late-cancel fee, so it is never universal.
    feeVaries: lateCancelFee != null,
  };

  // Penalties switched off is not the same as no consequence: the legacy path
  // still forfeits a pack booking's credit. Saying "no penalty" here would
  // mislead exactly the members who lose the most.
  if (!policy.noShowPenaltyEnabled) {
    return {
      windowHours,
      lateCancel,
      noShow: { losesCredit: true, fee: null, feeVaries: false },
    };
  }

  const packFee = policy.noShowChargeFee ? (policy.noShowPenaltyAmount ?? 0) : 0;
  const unlimitedFee = policy.noShowChargeFee
    ? (policy.noShowFeeAmountUnlimited ?? policy.noShowPenaltyAmount ?? 0)
    : 0;
  const top = Math.max(packFee, unlimitedFee);
  const fee = top > 0 ? top : null;

  return {
    windowHours,
    lateCancel,
    noShow: {
      losesCredit: policy.noShowLoseCredit,
      fee,
      // Betoro is the live case: packs pay nothing, unlimited pays €15.
      feeVaries: fee != null && packFee !== unlimitedFee,
    },
  };
}

/** One member's booking, already resolved against their package. */
export interface BookingPolicy {
  windowHours: number;
  isUnlimited: boolean;
  /** From the package; the booking API zeroes it for pack members. */
  lateCancelFee: number;
  /** Output of resolveNoShowPenalty for this booking. */
  noShowLosesCredit: boolean;
  noShowFee: number;
}

/**
 * The exact policy for a booking that already exists — the confirmation email,
 * where the plan is known and there is no reason to hedge.
 */
export function bookingClauses(policy: BookingPolicy): NoticeClauses {
  const losesCredit = !policy.isUnlimited;

  return {
    windowHours: normaliseHours(policy.windowHours),
    lateCancel: {
      // Unlimited members have no credit to forfeit; they pay the fee instead.
      losesCredit,
      fee: policy.lateCancelFee > 0 ? policy.lateCancelFee : null,
      feeVaries: false,
    },
    noShow: {
      // Same guard as above rather than trusting the caller: whatever the
      // tenant flag says, there is no credit to take from an unlimited member.
      losesCredit: policy.noShowLosesCredit && losesCredit,
      fee: policy.noShowFee > 0 ? policy.noShowFee : null,
      feeVaries: false,
    },
  };
}
