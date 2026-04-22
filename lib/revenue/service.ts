// Revenue recognition service.
//
// Responsibilities:
//   - Recognize revenue events for bookings (drop-in, pack).
//   - Accrue daily pro-rata for unlimited subscriptions.
//   - Expire packs and emit breakage.
//   - Monthly close for unlimited: distribute the bucket across attended
//     bookings capped at drop-in price, leftover → monthly_breakage.
//   - Emit penalty revenue events.
//
// All functions are tenant-scoped via the entitlement. All writes are safe to
// re-run: RevenueEvent has a unique(entitlementId, eventDate, type) guard and
// service code handles the monthly_close replay explicitly.

import { prisma } from "@/lib/db";
import type {
  Entitlement,
  Prisma,
  RevenueEvent,
  RevenueEventType,
} from "@prisma/client";
import {
  ensureEntitlementForSubscriptionPeriod,
  ensureEntitlementForUserPackage,
} from "./entitlements";
import {
  allocateUnlimitedMonthly,
  dailyAccrualCents,
  lastDayOfMonth,
  monthBounds,
  packExpirationBreakageCents,
  perCreditCents,
} from "./math";
import type { BookingForAllocation } from "./types";

// ── Drop-in ─────────────────────────────────────────────────────────────────

/**
 * Recognize full drop-in amount at booking time. Attributed to the class.
 * Caller must have already created a drop-in Entitlement (or provide one).
 */
export async function recognizeDropInBooking(params: {
  entitlementId: string;
  bookingId: string;
  classId: string;
  scheduledAt: Date;
}): Promise<RevenueEvent> {
  const ent = await prisma.entitlement.findUniqueOrThrow({
    where: { id: params.entitlementId },
  });

  if (ent.type !== "dropin") {
    throw new Error(`Entitlement ${ent.id} is not a dropin (got ${ent.type})`);
  }

  return prisma.$transaction(async (tx) => {
    const event = await tx.revenueEvent.upsert({
      where: {
        uniq_entitlement_date_type: {
          entitlementId: ent.id,
          eventDate: toDateOnly(params.scheduledAt),
          type: "booking",
        },
      },
      create: {
        tenantId: ent.tenantId,
        entitlementId: ent.id,
        eventDate: toDateOnly(params.scheduledAt),
        amountCents: ent.totalAmountCents,
        type: "booking",
        bookingId: params.bookingId,
        classId: params.classId,
      },
      update: {}, // idempotent
    });

    await tx.booking.update({
      where: { id: params.bookingId },
      data: {
        imputedValueCents: ent.totalAmountCents,
        sourceEntitlementId: ent.id,
      },
    });

    await tx.entitlement.update({
      where: { id: ent.id },
      data: { status: "exhausted", creditsUsed: 1 },
    });

    return event;
  });
}

// ── Pack booking ────────────────────────────────────────────────────────────

/**
 * Recognize per-credit value for a pack consumption. Does NOT mutate
 * UserPackage.creditsUsed — that lives in the existing booking flow. We only
 * sync the accounting counter (Entitlement.creditsUsed) to match.
 */
export async function recognizePackBooking(params: {
  userPackageId: string;
  bookingId: string;
  classId: string;
  scheduledAt: Date;
}): Promise<RevenueEvent> {
  const ent = await ensureEntitlementForUserPackage(params.userPackageId);

  if (ent.type !== "pack") {
    throw new Error(`Entitlement ${ent.id} is not a pack (got ${ent.type})`);
  }
  if (ent.creditsTotal == null) {
    throw new Error(`Pack entitlement ${ent.id} has no creditsTotal`);
  }

  const perCredit = perCreditCents(ent.totalAmountCents, ent.creditsTotal);

  return prisma.$transaction(async (tx) => {
    const event = await tx.revenueEvent.upsert({
      where: {
        uniq_entitlement_date_type: {
          entitlementId: ent.id,
          eventDate: toDateOnly(params.scheduledAt),
          type: "booking",
        },
      },
      create: {
        tenantId: ent.tenantId,
        entitlementId: ent.id,
        eventDate: toDateOnly(params.scheduledAt),
        amountCents: perCredit,
        type: "booking",
        bookingId: params.bookingId,
        classId: params.classId,
      },
      update: {},
    });

    await tx.booking.update({
      where: { id: params.bookingId },
      data: {
        imputedValueCents: perCredit,
        sourceEntitlementId: ent.id,
      },
    });

    // Sync the Entitlement counter with the UserPackage's authoritative value.
    const up = await tx.userPackage.findUnique({
      where: { id: params.userPackageId },
      select: { creditsUsed: true },
    });
    if (up) {
      const exhausted =
        ent.creditsTotal !== null && up.creditsUsed >= ent.creditsTotal;
      await tx.entitlement.update({
        where: { id: ent.id },
        data: {
          creditsUsed: up.creditsUsed,
          status: exhausted ? "exhausted" : ent.status,
        },
      });
    }

    return event;
  });
}

// ── Pack expiration ─────────────────────────────────────────────────────────

/**
 * Expire all packs past period_end with unconsumed credits and emit breakage.
 * Idempotent: the unique(entitlementId, date, type) guard blocks re-emission.
 * Runs against a single tenant for easier per-tenant-timezone scheduling.
 */
export async function runPackExpirationForTenant(
  tenantId: string,
  now: Date = new Date(),
): Promise<{ expired: number; breakageEmitted: number }> {
  const candidates = await prisma.entitlement.findMany({
    where: {
      tenantId,
      type: "pack",
      status: "active",
      periodEnd: { lt: now },
    },
  });

  let expired = 0;
  let breakageEmitted = 0;

  for (const ent of candidates) {
    if (ent.creditsTotal == null) continue;
    const breakageCents = packExpirationBreakageCents(
      ent.totalAmountCents,
      ent.creditsTotal,
      ent.creditsUsed,
    );

    await prisma.$transaction(async (tx) => {
      if (breakageCents > 0) {
        const existing = await tx.revenueEvent.findUnique({
          where: {
            uniq_entitlement_date_type: {
              entitlementId: ent.id,
              eventDate: toDateOnly(ent.periodEnd),
              type: "expiration_breakage",
            },
          },
        });
        if (!existing) {
          await tx.revenueEvent.create({
            data: {
              tenantId: ent.tenantId,
              entitlementId: ent.id,
              eventDate: toDateOnly(ent.periodEnd),
              amountCents: breakageCents,
              type: "expiration_breakage",
            },
          });
          breakageEmitted++;
        }
      }
      await tx.entitlement.update({
        where: { id: ent.id },
        data: { status: "expired" },
      });
    });

    expired++;
  }

  return { expired, breakageEmitted };
}

// ── Unlimited daily accrual ─────────────────────────────────────────────────

/**
 * For a given date, insert a `daily_accrual` event per active unlimited
 * entitlement that covers that date. Idempotent via the unique index.
 */
export async function runDailyAccrualForTenant(
  tenantId: string,
  targetDate: Date,
): Promise<{ accrued: number }> {
  const dayStart = toDateOnly(targetDate);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);

  // Ensure an Entitlement exists for every active subscription covering this
  // date (backfill path). Cheap no-op if already present.
  const activeSubs = await prisma.memberSubscription.findMany({
    where: {
      tenantId,
      status: { in: ["active", "trialing", "past_due"] },
      currentPeriodStart: { lte: nextDay },
      currentPeriodEnd: { gte: dayStart },
    },
    select: { id: true },
  });
  for (const s of activeSubs) {
    await ensureEntitlementForSubscriptionPeriod(s.id);
  }

  const entitlements = await prisma.entitlement.findMany({
    where: {
      tenantId,
      type: "unlimited",
      status: "active",
      periodStart: { lte: nextDay },
      periodEnd: { gte: dayStart },
    },
  });

  let accrued = 0;
  for (const ent of entitlements) {
    const amount = dailyAccrualCents(
      ent.totalAmountCents,
      ent.periodStart,
      ent.periodEnd,
    );
    if (amount <= 0) continue;

    try {
      await prisma.revenueEvent.create({
        data: {
          tenantId: ent.tenantId,
          entitlementId: ent.id,
          eventDate: dayStart,
          amountCents: amount,
          type: "daily_accrual",
        },
      });
      accrued++;
    } catch (err) {
      // Prisma unique constraint violation → already accrued for this day.
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }

  return { accrued };
}

// ── Monthly close for unlimited entitlements ───────────────────────────────

/**
 * Runs the month close for a tenant: for every unlimited entitlement with
 * activity in the month (either accruals or attended bookings), distributes
 * the month's bucket across attended bookings and emits monthly_breakage.
 *
 * Replay strategy: delete any previously-emitted `booking` and
 * `monthly_breakage` events for the month, then re-emit atomically. This way
 * re-running a close produces an identical, consistent result (chosen per
 * spec AC #21 "regenerates identically and atomically").
 */
export async function runMonthlyCloseForTenant(
  tenantId: string,
  month: string, // "YYYY-MM"
): Promise<{ entitlementsProcessed: number; breakageEvents: number }> {
  const { start, end } = monthBounds(month);
  const monthEndDate = lastDayOfMonth(start);

  // Only unlimited entitlements need the monthly allocation pass.
  const entitlements = await prisma.entitlement.findMany({
    where: {
      tenantId,
      type: "unlimited",
      OR: [
        { periodStart: { lte: end }, periodEnd: { gte: start } },
        {
          revenueEvents: {
            some: {
              type: "daily_accrual",
              eventDate: { gte: start, lte: end },
            },
          },
        },
      ],
    },
  });

  let processed = 0;
  let breakageEvents = 0;

  for (const ent of entitlements) {
    const result = await closeEntitlementForMonth(ent, start, end, monthEndDate);
    processed++;
    if (result.monthlyBreakageCents > 0) breakageEvents++;
  }

  return { entitlementsProcessed: processed, breakageEvents };
}

async function closeEntitlementForMonth(
  ent: Entitlement,
  monthStart: Date,
  monthEnd: Date,
  monthEndDate: Date,
) {
  return prisma.$transaction(async (tx) => {
    // Sum daily_accrual in month → this is the bucket we must allocate.
    const accruals = await tx.revenueEvent.aggregate({
      where: {
        entitlementId: ent.id,
        type: "daily_accrual",
        eventDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amountCents: true },
    });
    const monthlyBucketCents = accruals._sum.amountCents ?? 0;

    // Attended bookings in month attributable to this entitlement.
    // Prefer booking.sourceEntitlementId (explicit link). For backfilled rows
    // where only Booking.packageUsed is set, we also match via userPackageId
    // when the entitlement was created from a UserPackage — but unlimited
    // entitlements come from MemberSubscription, so that fallback doesn't
    // apply here. Unlimited bookings rely on sourceEntitlementId being set
    // by the booking flow (or by the backfill script for subscription
    // members).
    const bookings = await tx.booking.findMany({
      where: {
        sourceEntitlementId: ent.id,
        status: "ATTENDED",
        class: { startsAt: { gte: monthStart, lte: monthEnd } },
      },
      include: {
        class: { include: { classType: true } },
      },
    });

    // Wipe previously emitted booking/monthly_breakage events for this
    // (entitlement, month) so replay is deterministic.
    await tx.revenueEvent.deleteMany({
      where: {
        entitlementId: ent.id,
        type: { in: ["booking", "monthly_breakage"] },
        eventDate: { gte: monthStart, lte: monthEnd },
      },
    });

    const allocationInput: BookingForAllocation[] = bookings.map((b) => ({
      id: b.id,
      classId: b.classId,
      scheduledAt: b.class.startsAt,
      weight: Number(b.class.classType.revenueWeight),
      dropInPriceCents: b.class.classType.dropInPriceCents,
    }));

    const result = allocateUnlimitedMonthly(
      ent.id,
      monthlyBucketCents,
      allocationInput,
    );

    for (const alloc of result.allocations) {
      const booking = bookings.find((b) => b.id === alloc.bookingId)!;
      await tx.revenueEvent.create({
        data: {
          tenantId: ent.tenantId,
          entitlementId: ent.id,
          eventDate: toDateOnly(booking.class.startsAt),
          amountCents: alloc.amountCents,
          type: "booking",
          bookingId: booking.id,
          classId: booking.classId,
          metadata: {
            raw: alloc.rawCents,
            was_capped: alloc.wasCapped,
            weight: alloc.weight,
            base_rate_per_weight:
              result.monthlyBucketCents /
              Math.max(
                1,
                allocationInput.reduce((s, b) => s + b.weight, 0),
              ),
          } as Prisma.InputJsonValue,
        },
      });
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          imputedValueCents: alloc.amountCents,
          classWeightSnapshot: alloc.weight,
        },
      });
    }

    if (result.monthlyBreakageCents > 0) {
      await tx.revenueEvent.create({
        data: {
          tenantId: ent.tenantId,
          entitlementId: ent.id,
          eventDate: toDateOnly(monthEndDate),
          amountCents: result.monthlyBreakageCents,
          type: "monthly_breakage",
        },
      });
    }

    return result;
  });
}

// ── Penalty ─────────────────────────────────────────────────────────────────

/**
 * Record a penalty charge as a synthetic Entitlement + RevenueEvent.
 * Intended to be called from the payment pipeline once a penalty payment
 * (Stripe or POS) succeeds.
 */
export async function recognizePenalty(params: {
  tenantId: string;
  userId: string;
  classId: string;
  amountCents: number;
  chargedAt: Date;
  currency?: string;
}): Promise<RevenueEvent> {
  const currency = (params.currency ?? "eur").toLowerCase();

  return prisma.$transaction(async (tx) => {
    const ent = await tx.entitlement.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        classId: params.classId,
        type: "penalty",
        status: "exhausted",
        totalAmountCents: params.amountCents,
        currency,
        creditsTotal: null,
        creditsUsed: 0,
        periodStart: params.chargedAt,
        periodEnd: params.chargedAt,
        purchasedAt: params.chargedAt,
      },
    });

    return tx.revenueEvent.create({
      data: {
        tenantId: params.tenantId,
        entitlementId: ent.id,
        eventDate: toDateOnly(params.chargedAt),
        amountCents: params.amountCents,
        type: "penalty",
        classId: params.classId,
      },
    });
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

export const REVENUE_EVENT_REPORT_TYPES: RevenueEventType[] = [
  "booking",
  "penalty",
  "expiration_breakage",
  "monthly_breakage",
];
