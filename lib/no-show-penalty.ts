// No-show penalty evaluation & pending-penalty creation.
//
// A single booking is evaluated against the tenant's policy to decide:
//   - Should the member lose their credit? (only meaningful for pack bookings;
//     unlimited bookings never consume a credit in the first place)
//   - Should a monetary fee be charged, and how much?
//
// The result is a PendingPenalty row that queues for admin review. When the
// tenant's grace window elapses, an auto-confirm cron sweeps pending rows and
// applies the penalty (credit stays lost; fee is recognized as revenue).

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toStripeAmount } from "@/lib/stripe/helpers";
import { restoreCredit } from "@/lib/credits";
import { recognizePenalty } from "@/lib/revenue/service";

export interface TenantPenaltyPolicy {
  noShowPenaltyEnabled: boolean;
  noShowLoseCredit: boolean;
  noShowChargeFee: boolean;
  noShowPenaltyAmount: number | null;
  noShowFeeAmountUnlimited: number | null;
  noShowPenaltyGraceHours: number;
}

export interface PenaltyDecision {
  loseCredit: boolean;
  chargeFee: boolean;
  feeAmountCents: number;
  isUnlimited: boolean;
}

export type PenaltyReason = "no_show" | "late_cancel";

/**
 * Compute the penalty that should apply to a booking based on tenant policy
 * and whether the booking was funded by an unlimited package. Returns a
 * decision with all flags — callers filter out no-op decisions (both flags
 * false) before persisting.
 *
 * `unlimitedFeeCentsOverride` is the funding package's own no-show fee
 * (Package.noShowFeeCents) — when set it wins over the tenant-level amounts
 * for unlimited bookings, so a studio can price the penalty per subscription.
 */
export function resolveNoShowPenalty(
  policy: TenantPenaltyPolicy,
  isUnlimited: boolean,
  unlimitedFeeCentsOverride?: number | null,
): PenaltyDecision {
  if (!policy.noShowPenaltyEnabled) {
    // Legacy default: pack bookings forfeit their credit on no-show (the
    // credit is already consumed when the booking was created). Unlimited
    // bookings never consume a credit, so nothing to forfeit.
    return {
      loseCredit: !isUnlimited,
      chargeFee: false,
      feeAmountCents: 0,
      isUnlimited,
    };
  }

  const loseCredit = policy.noShowLoseCredit && !isUnlimited;

  if (isUnlimited && unlimitedFeeCentsOverride != null) {
    return {
      loseCredit,
      chargeFee: unlimitedFeeCentsOverride > 0,
      feeAmountCents: Math.max(0, unlimitedFeeCentsOverride),
      isUnlimited,
    };
  }

  let chargeFee = false;
  let feeAmount: number | null = null;
  if (policy.noShowChargeFee) {
    feeAmount = isUnlimited
      ? policy.noShowFeeAmountUnlimited ?? policy.noShowPenaltyAmount
      : policy.noShowPenaltyAmount;
    chargeFee = feeAmount !== null && feeAmount > 0;
  }

  return {
    loseCredit,
    chargeFee,
    feeAmountCents: chargeFee && feeAmount ? toStripeAmount(feeAmount) : 0,
    isUnlimited,
  };
}

/**
 * The booking-level cancellation policy: the tenant defaults, overridden by the
 * package that funded the booking (packageUsed → UserPackage → Package), or —
 * when the booking carries no package link — by the member's active
 * subscription. This is what makes per-package windows and fees work.
 */
export async function resolveCancellationPolicy(opts: {
  tenantId: string;
  userId: string | null;
  packageUsed: string | null;
}): Promise<{
  windowHours: number;
  windowMs: number;
  isUnlimited: boolean;
  lateCancelFeeCents: number;
  noShowFeeCentsOverride: number | null;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: { cancellationWindowHours: true },
  });

  let pkg: {
    cancellationWindowHours: number | null;
    lateCancelFeeCents: number | null;
    noShowFeeCents: number | null;
  } | null = null;
  let isUnlimited = false;

  if (opts.packageUsed) {
    const up = await prisma.userPackage.findUnique({
      where: { id: opts.packageUsed },
      select: {
        creditsTotal: true,
        package: {
          select: {
            cancellationWindowHours: true,
            lateCancelFeeCents: true,
            noShowFeeCents: true,
          },
        },
      },
    });
    pkg = up?.package ?? null;
    isUnlimited = up?.creditsTotal === null;
  } else if (opts.userId) {
    const sub = await prisma.memberSubscription.findFirst({
      where: { tenantId: opts.tenantId, userId: opts.userId, status: { in: ["active", "trialing"] } },
      select: {
        package: {
          select: {
            cancellationWindowHours: true,
            lateCancelFeeCents: true,
            noShowFeeCents: true,
          },
        },
      },
    });
    pkg = sub?.package ?? null;
    isUnlimited = !!sub;
  }

  const windowHours = pkg?.cancellationWindowHours ?? tenant?.cancellationWindowHours ?? 12;
  return {
    windowHours,
    windowMs: windowHours * 60 * 60 * 1000,
    isUnlimited,
    lateCancelFeeCents: pkg?.lateCancelFeeCents ?? 0,
    noShowFeeCentsOverride: pkg?.noShowFeeCents ?? null,
  };
}

/**
 * Returns true if the decision should be persisted (i.e. it's not a no-op).
 */
export function hasAnyPenalty(d: PenaltyDecision): boolean {
  return d.loseCredit || d.chargeFee;
}

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Create a PendingPenalty row for a booking. Idempotent via the unique
 * constraint on bookingId: if one already exists, returns the existing row
 * without modification.
 */
export async function createPendingPenalty(
  db: DbClient,
  params: {
    tenantId: string;
    bookingId: string;
    classId: string;
    userId: string | null;
    decision: PenaltyDecision;
    graceHours: number;
    now?: Date;
    reason?: PenaltyReason;
  },
) {
  const now = params.now ?? new Date();
  const autoConfirmAt = new Date(now.getTime() + params.graceHours * 60 * 60 * 1000);

  const existing = await db.pendingPenalty.findUnique({
    where: { bookingId: params.bookingId },
  });
  if (existing) return existing;

  return db.pendingPenalty.create({
    data: {
      tenantId: params.tenantId,
      bookingId: params.bookingId,
      classId: params.classId,
      userId: params.userId,
      loseCredit: params.decision.loseCredit,
      chargeFee: params.decision.chargeFee,
      feeAmountCents: params.decision.feeAmountCents,
      isUnlimited: params.decision.isUnlimited,
      reason: params.reason ?? "no_show",
      status: "pending",
      createdAt: now,
      autoConfirmAt,
    },
  });
}

/**
 * Confirm a pending penalty: recognize the fee (if any) as revenue and close
 * the entry. Credit loss was already applied on the booking when NO_SHOW was
 * marked, so nothing to do there.
 *
 * Idempotent: already-resolved penalties are returned unchanged.
 */
export async function confirmPendingPenalty(params: {
  pendingId: string;
  resolvedBy: string | null;
  note?: string;
}) {
  const pending = await prisma.pendingPenalty.findUnique({
    where: { id: params.pendingId },
  });
  if (!pending || pending.status !== "pending") return pending;

  let revenueEventId: string | null = null;
  if (pending.chargeFee && pending.feeAmountCents > 0 && pending.userId) {
    try {
      const evt = await recognizePenalty({
        tenantId: pending.tenantId,
        userId: pending.userId,
        classId: pending.classId,
        amountCents: pending.feeAmountCents,
        chargedAt: new Date(),
      });
      revenueEventId = evt.id;
    } catch (err) {
      console.error("[pending-penalty] recognizePenalty failed", {
        pendingId: pending.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return prisma.pendingPenalty.update({
    where: { id: pending.id },
    data: {
      status: "confirmed",
      resolvedAt: new Date(),
      resolvedBy: params.resolvedBy,
      resolutionNote: params.note ?? null,
      revenueEventId,
    },
  });
}

/**
 * Waive a pending penalty: skip the fee. Credit remains lost (if that flag was
 * part of the policy) — waive only forgives the monetary charge. To also
 * restore the credit, use revertPendingPenalty.
 */
export async function waivePendingPenalty(params: {
  pendingId: string;
  resolvedBy: string;
  note?: string;
}) {
  const pending = await prisma.pendingPenalty.findUnique({
    where: { id: params.pendingId },
  });
  if (!pending || pending.status !== "pending") return pending;

  return prisma.pendingPenalty.update({
    where: { id: pending.id },
    data: {
      status: "waived",
      resolvedAt: new Date(),
      resolvedBy: params.resolvedBy,
      resolutionNote: params.note ?? null,
    },
  });
}

/**
 * Revert a pending penalty: flip the booking back to ATTENDED, restore the
 * credit if one was forfeited, and close the entry as reverted. Use when the
 * no-show was a mistake (e.g. the member attended but wasn't checked in).
 */
export async function revertPendingPenalty(params: {
  pendingId: string;
  resolvedBy: string;
  note?: string;
}) {
  const pending = await prisma.pendingPenalty.findUnique({
    where: { id: params.pendingId },
    include: {
      booking: {
        include: { class: { select: { id: true, classTypeId: true } } },
      },
    },
  });
  if (!pending || pending.status !== "pending") return pending;

  const { booking } = pending;

  await prisma.pendingPenalty.update({
    where: { id: pending.id },
    data: {
      status: "reverted",
      resolvedAt: new Date(),
      resolvedBy: params.resolvedBy,
      resolutionNote: params.note ?? null,
    },
  });

  // A late-cancel penalty is attached to a booking the member actually
  // cancelled — reverting forgives the fee but must NOT resurrect the booking
  // as ATTENDED (that's the no-show-was-a-mistake path only).
  if (pending.reason === "late_cancel") {
    return prisma.pendingPenalty.findUnique({ where: { id: pending.id } });
  }

  if (pending.loseCredit && booking.packageUsed && booking.creditLost) {
    await restoreCredit(booking.packageUsed, booking.class.classTypeId);
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "ATTENDED",
      creditLost: false,
    },
  });

  if (booking.userId) {
    await prisma.checkIn.upsert({
      where: {
        classId_memberId: { classId: booking.classId, memberId: booking.userId },
      },
      create: {
        tenantId: pending.tenantId,
        classId: booking.classId,
        memberId: booking.userId,
        checkedInBy: params.resolvedBy,
        method: "manual",
        status: "present",
      },
      update: {},
    });
  }

  return prisma.pendingPenalty.findUnique({ where: { id: pending.id } });
}
