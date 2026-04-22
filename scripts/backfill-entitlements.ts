/**
 * Backfill Entitlements + RevenueEvents from existing UserPackage,
 * MemberSubscription and Booking history.
 *
 * Safe to run multiple times:
 *   - ensureEntitlementForUserPackage / ensureEntitlementForSubscriptionPeriod
 *     are idempotent (unique link on Entitlement.userPackageId, and a
 *     (memberSubscriptionId, periodStart, periodEnd) lookup for subs).
 *   - RevenueEvent has a unique (entitlementId, eventDate, type) guard, so
 *     re-emitting pack bookings is a no-op at the DB level.
 *   - Monthly close wipes and re-emits `booking` + `monthly_breakage` events
 *     for the target month atomically.
 *
 * What it does:
 *   1. One Entitlement per UserPackage (type = pack or unlimited depending on
 *      the Package.type).
 *   2. One Entitlement per MemberSubscription (current billing period only —
 *      we don't have past-period boundaries stored, so historical months of
 *      subscription bookings will only be attributed if the class falls
 *      inside the current Stripe period).
 *   3. For every historical Booking that consumed a credit (packageUsed set
 *      and not a refunded cancellation): set Booking.sourceEntitlementId,
 *      Booking.imputedValueCents and Booking.classWeightSnapshot, and emit a
 *      `booking` RevenueEvent dated at Class.startsAt. For pack entitlements
 *      the amount is perCreditCents. For unlimited entitlements the amount
 *      is left to monthly close (we only link sourceEntitlementId).
 *   4. For attended bookings by subscription members where packageUsed is
 *      null but the user had an active unlimited subscription covering the
 *      class date: link sourceEntitlementId so monthly close can attribute.
 *   5. Optionally run pack expiration and monthly close for the requested
 *      months.
 *
 * Usage:
 *   TENANT_ID=cxxx npx tsx scripts/backfill-entitlements.ts
 *   TENANT_ID=all npx tsx scripts/backfill-entitlements.ts
 *   BACKFILL_MONTHS=2026-03,2026-04 npx tsx scripts/backfill-entitlements.ts
 *   BACKFILL_DRY_RUN=1 npx tsx scripts/backfill-entitlements.ts
 *   BACKFILL_SKIP_CLOSE=1 BACKFILL_SKIP_EXPIRATION=1 npx tsx scripts/backfill-entitlements.ts
 *
 * If TENANT_ID is unset and there is exactly one tenant, that one is used.
 */

import type { Entitlement, MemberSubscription, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ensureEntitlementForSubscriptionPeriod,
  ensureEntitlementForUserPackage,
} from "@/lib/revenue/entitlements";
import { perCreditCents } from "@/lib/revenue/math";
import {
  runMonthlyCloseForTenant,
  runPackExpirationForTenant,
} from "@/lib/revenue/service";

interface TenantStats {
  tenantId: string;
  tenantName: string;
  entitlementsFromUserPackages: number;
  entitlementsFromSubscriptions: number;
  bookingsLinkedPack: number;
  bookingsLinkedUnlimited: number;
  bookingsSkipped: number;
  packEventsEmitted: number;
  expired: number;
  expirationBreakageEvents: number;
  monthlyCloses: { month: string; entitlementsProcessed: number; breakageEvents: number }[];
  errors: string[];
}

function parseMonths(raw: string | undefined): string[] {
  if (!raw) {
    // default to current month only
    const now = new Date();
    return [`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{4}-\d{2}$/.test(s));
}

function toDateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

async function resolveTenants(): Promise<{ id: string; name: string }[]> {
  const arg = process.env.TENANT_ID?.trim();
  if (arg === "all") {
    return prisma.tenant.findMany({ select: { id: true, name: true } });
  }
  if (arg) {
    const t = await prisma.tenant.findUnique({
      where: { id: arg },
      select: { id: true, name: true },
    });
    if (!t) throw new Error(`Tenant ${arg} not found`);
    return [t];
  }
  const all = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (all.length === 1) return all;
  throw new Error(
    `Multiple tenants found. Re-run with TENANT_ID=<id> or TENANT_ID=all. Tenants: ${all
      .map((t) => `${t.name}:${t.id}`)
      .join(", ")}`,
  );
}

async function backfillUserPackages(
  tenantId: string,
  dryRun: boolean,
): Promise<{ created: number }> {
  const ups = await prisma.userPackage.findMany({
    where: { tenantId },
    select: { id: true },
  });
  if (dryRun) return { created: ups.length };

  let created = 0;
  for (const up of ups) {
    const before = await prisma.entitlement.findUnique({
      where: { userPackageId: up.id },
      select: { id: true },
    });
    await ensureEntitlementForUserPackage(up.id);
    if (!before) created++;
  }
  return { created };
}

async function backfillSubscriptions(
  tenantId: string,
  dryRun: boolean,
): Promise<{ created: number; subs: MemberSubscription[] }> {
  const subs = await prisma.memberSubscription.findMany({
    where: { tenantId },
  });
  if (dryRun) return { created: subs.length, subs };

  let created = 0;
  for (const s of subs) {
    const before = await prisma.entitlement.findFirst({
      where: {
        memberSubscriptionId: s.id,
        periodStart: s.currentPeriodStart,
        periodEnd: s.currentPeriodEnd,
      },
      select: { id: true },
    });
    await ensureEntitlementForSubscriptionPeriod(s.id);
    if (!before) created++;
  }
  return { created, subs };
}

/**
 * Pack / drop-in bookings: the authoritative link is Booking.packageUsed →
 * UserPackage.id. For each such booking that consumed a credit, stamp the
 * snapshot columns and emit a `booking` RevenueEvent.
 */
async function backfillPackBookings(
  tenantId: string,
  dryRun: boolean,
): Promise<{ linked: number; skipped: number; events: number; errors: string[] }> {
  const errors: string[] = [];

  const bookings = await prisma.booking.findMany({
    where: {
      tenantId,
      packageUsed: { not: null },
      // A booking consumed a credit unless it was cancelled AND the credit
      // was restored (creditLost=false in that case).
      NOT: { AND: [{ status: "CANCELLED" }, { creditLost: false }] },
    },
    include: {
      class: { include: { classType: true } },
    },
  });

  let linked = 0;
  let skipped = 0;
  let events = 0;

  for (const b of bookings) {
    if (!b.packageUsed) continue;

    // Resolve the entitlement for this UserPackage (packs AND subscription-
    // backed UserPackages both route through here). Already created in
    // Phase 1, but we look it up rather than re-create.
    const ent = await prisma.entitlement.findUnique({
      where: { userPackageId: b.packageUsed },
    });
    if (!ent) {
      // UserPackage was deleted — we can't reconstruct the amount.
      skipped++;
      continue;
    }

    if (ent.type === "pack" || ent.type === "dropin") {
      if (ent.creditsTotal == null || ent.creditsTotal <= 0) {
        errors.push(`Entitlement ${ent.id} (type=${ent.type}) has no creditsTotal`);
        skipped++;
        continue;
      }
      const amount = perCreditCents(ent.totalAmountCents, ent.creditsTotal);
      const weight = Number(b.class.classType.revenueWeight);

      if (dryRun) {
        linked++;
        events++;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const result = await tx.revenueEvent.upsert({
            where: {
              uniq_entitlement_date_type: {
                entitlementId: ent.id,
                eventDate: toDateOnly(b.class.startsAt),
                type: "booking",
              },
            },
            create: {
              tenantId: ent.tenantId,
              entitlementId: ent.id,
              eventDate: toDateOnly(b.class.startsAt),
              amountCents: amount,
              type: "booking",
              bookingId: b.id,
              classId: b.classId,
              metadata: { backfill: true } as Prisma.InputJsonValue,
            },
            update: {
              // If an earlier backfill or recognizer already wrote this
              // slot, we don't overwrite it.
              bookingId: undefined,
            },
          });
          await tx.booking.update({
            where: { id: b.id },
            data: {
              sourceEntitlementId: ent.id,
              imputedValueCents: amount,
              classWeightSnapshot: weight,
            },
          });
          if (result.bookingId === b.id && result.amountCents === amount) {
            events++;
          }
        });
        linked++;
      } catch (err) {
        errors.push(`Booking ${b.id}: ${(err as Error).message}`);
        skipped++;
      }
    } else if (ent.type === "unlimited") {
      // Unlimited bookings: link only. The amount is set by monthly close.
      if (dryRun) {
        linked++;
        continue;
      }
      try {
        await prisma.booking.update({
          where: { id: b.id },
          data: {
            sourceEntitlementId: ent.id,
            classWeightSnapshot: Number(b.class.classType.revenueWeight),
          },
        });
        linked++;
      } catch (err) {
        errors.push(`Booking ${b.id}: ${(err as Error).message}`);
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  return { linked, skipped, events, errors };
}

/**
 * Attended bookings without packageUsed but whose user had an active
 * unlimited subscription covering the class date: link sourceEntitlementId
 * so monthly close attributes them.
 */
async function linkUnattributedUnlimitedBookings(
  tenantId: string,
  subs: MemberSubscription[],
  dryRun: boolean,
): Promise<{ linked: number }> {
  if (subs.length === 0) return { linked: 0 };

  // Build index: userId → list of Entitlement periods.
  const subEntitlements = await prisma.entitlement.findMany({
    where: {
      tenantId,
      type: "unlimited",
      memberSubscriptionId: { in: subs.map((s) => s.id) },
    },
  });
  const byUser = new Map<string, Entitlement[]>();
  for (const e of subEntitlements) {
    const list = byUser.get(e.userId) ?? [];
    list.push(e);
    byUser.set(e.userId, list);
  }

  const candidates = await prisma.booking.findMany({
    where: {
      tenantId,
      userId: { in: Array.from(byUser.keys()) },
      sourceEntitlementId: null,
      packageUsed: null,
      status: "ATTENDED",
    },
    include: { class: { include: { classType: true } } },
  });

  let linked = 0;
  for (const b of candidates) {
    if (!b.userId) continue;
    const userSubs = byUser.get(b.userId) ?? [];
    const match = userSubs.find(
      (e) => e.periodStart <= b.class.startsAt && e.periodEnd >= b.class.startsAt,
    );
    if (!match) continue;
    if (dryRun) {
      linked++;
      continue;
    }
    await prisma.booking.update({
      where: { id: b.id },
      data: {
        sourceEntitlementId: match.id,
        classWeightSnapshot: Number(b.class.classType.revenueWeight),
      },
    });
    linked++;
  }

  return { linked };
}

async function backfillTenant(
  tenantId: string,
  tenantName: string,
  opts: {
    dryRun: boolean;
    months: string[];
    skipExpiration: boolean;
    skipClose: boolean;
  },
): Promise<TenantStats> {
  const stats: TenantStats = {
    tenantId,
    tenantName,
    entitlementsFromUserPackages: 0,
    entitlementsFromSubscriptions: 0,
    bookingsLinkedPack: 0,
    bookingsLinkedUnlimited: 0,
    bookingsSkipped: 0,
    packEventsEmitted: 0,
    expired: 0,
    expirationBreakageEvents: 0,
    monthlyCloses: [],
    errors: [],
  };

  const { created: upCreated } = await backfillUserPackages(tenantId, opts.dryRun);
  stats.entitlementsFromUserPackages = upCreated;

  const { created: subCreated, subs } = await backfillSubscriptions(
    tenantId,
    opts.dryRun,
  );
  stats.entitlementsFromSubscriptions = subCreated;

  const packResult = await backfillPackBookings(tenantId, opts.dryRun);
  stats.bookingsLinkedPack = packResult.linked;
  stats.bookingsSkipped = packResult.skipped;
  stats.packEventsEmitted = packResult.events;
  stats.errors.push(...packResult.errors);

  const unlimitedResult = await linkUnattributedUnlimitedBookings(
    tenantId,
    subs,
    opts.dryRun,
  );
  stats.bookingsLinkedUnlimited = unlimitedResult.linked;

  if (!opts.skipExpiration && !opts.dryRun) {
    try {
      const expResult = await runPackExpirationForTenant(tenantId);
      stats.expired = expResult.expired;
      stats.expirationBreakageEvents = expResult.breakageEmitted;
    } catch (err) {
      stats.errors.push(`Pack expiration: ${(err as Error).message}`);
    }
  }

  if (!opts.skipClose && !opts.dryRun) {
    for (const month of opts.months) {
      try {
        const closeResult = await runMonthlyCloseForTenant(tenantId, month);
        stats.monthlyCloses.push({
          month,
          entitlementsProcessed: closeResult.entitlementsProcessed,
          breakageEvents: closeResult.breakageEvents,
        });
      } catch (err) {
        stats.errors.push(`Monthly close ${month}: ${(err as Error).message}`);
      }
    }
  }

  return stats;
}

async function main() {
  const dryRun = !!process.env.BACKFILL_DRY_RUN;
  const skipExpiration = !!process.env.BACKFILL_SKIP_EXPIRATION;
  const skipClose = !!process.env.BACKFILL_SKIP_CLOSE;
  const months = parseMonths(process.env.BACKFILL_MONTHS);

  const tenants = await resolveTenants();

  const results: TenantStats[] = [];
  for (const t of tenants) {
    const stats = await backfillTenant(t.id, t.name, {
      dryRun,
      months,
      skipExpiration,
      skipClose,
    });
    results.push(stats);
  }

  const summary = {
    dryRun,
    months: skipClose ? [] : months,
    skipExpiration,
    tenants: results,
    totals: results.reduce(
      (acc, s) => ({
        entitlementsFromUserPackages:
          acc.entitlementsFromUserPackages + s.entitlementsFromUserPackages,
        entitlementsFromSubscriptions:
          acc.entitlementsFromSubscriptions + s.entitlementsFromSubscriptions,
        bookingsLinkedPack: acc.bookingsLinkedPack + s.bookingsLinkedPack,
        bookingsLinkedUnlimited:
          acc.bookingsLinkedUnlimited + s.bookingsLinkedUnlimited,
        bookingsSkipped: acc.bookingsSkipped + s.bookingsSkipped,
        packEventsEmitted: acc.packEventsEmitted + s.packEventsEmitted,
        expired: acc.expired + s.expired,
        expirationBreakageEvents:
          acc.expirationBreakageEvents + s.expirationBreakageEvents,
      }),
      {
        entitlementsFromUserPackages: 0,
        entitlementsFromSubscriptions: 0,
        bookingsLinkedPack: 0,
        bookingsLinkedUnlimited: 0,
        bookingsSkipped: 0,
        packEventsEmitted: 0,
        expired: 0,
        expirationBreakageEvents: 0,
      },
    ),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
