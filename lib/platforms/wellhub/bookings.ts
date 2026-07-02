// Inbound booking lifecycle: requested → confirmed/rejected → cancelled/checked-in.
//
// The critical contract is the **15-minute SLA** on `booking-requested`: if we
// don't PATCH /booking/v2/.../bookings/:booking_number within that window,
// Wellhub auto-rejects. The webhook route responds quickly and calls
// `processBookingRequested` synchronously (the work is small: a short DB
// transaction + one outbound PATCH).
//
// Capacity model (see lib/booking/availability.ts): Wellhub seats share the
// ONE physical room capacity with Magic members and other platforms. A Wellhub
// booking is accepted only if BOTH hold:
//   1. The platform quota has room   (bookedSpots < quotaSpots) — the cap.
//   2. The physical room has a seat  (availability.spotsLeft > 0) — no oversell.
// When a Wellhub booking is cancelled we free the quota AND promote the Magic
// waitlist / notify watchers / re-sync Wellhub's view, so a freed seat is
// reusable by ANY channel.

import type { PlatformBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  MAGIC_CONSUMING_STATUSES,
  PLATFORM_CONSUMING_STATUSES,
} from "@/lib/booking/availability";
import { promoteFromWaitlist, notifySpotWatchers } from "@/lib/waitlist";
import { bookingApi, getWellhubTokenForTenant } from "./client";
import { evaluateReservationDecision } from "./decision";
import { resolveTenantByWellhubGymId } from "./resolve";
import type {
  WellhubBookingCanceledEvent,
  WellhubBookingLateCanceledEvent,
  WellhubBookingPatchPayload,
  WellhubBookingRejectionReason,
  WellhubBookingRequestedEvent,
  WellhubBookingStatus,
  WellhubCheckinBookingOccurredEvent,
} from "./types";

const CONFIRMATION_SLA_MS = 15 * 60 * 1000;

// ─── Wellhub <-> Magic side: PATCH /booking/v2 ────────────────────────────

export function patchWellhubBooking(
  gymId: number,
  bookingNumber: string,
  payload: WellhubBookingPatchPayload,
  token: string,
): Promise<void> {
  return bookingApi<void>(
    `/booking/v2/gyms/${gymId}/bookings/${encodeURIComponent(bookingNumber)}`,
    { method: "PATCH", body: payload, token },
  );
}

// ─── Event handler: booking-requested ─────────────────────────────────────

/**
 * Processes a `booking-requested` webhook end-to-end:
 *   1. Resolve tenant + class by gym_id + slot.id.
 *   2. IDEMPOTENCY: if we already have a terminal decision for this
 *      booking_number, re-PATCH that same decision (Wellhub re-delivery /
 *      out-of-order) without touching counters again.
 *   3. Reserve atomically (quota cap + physical capacity) in a transaction.
 *   4. PATCH Wellhub with the decision.
 *
 * On a PATCH-time error the row stays `pending_confirmation`; the SLA sweep
 * cron retries. The route returns 5xx on a thrown error so Wellhub redelivers.
 */
export async function processBookingRequested(
  event: WellhubBookingRequestedEvent,
): Promise<{ status: WellhubBookingStatus; reason?: WellhubBookingRejectionReason }> {
  const { event_data: data } = event;
  const tenant = await resolveTenantByWellhubGymId(data.slot.gym_id);
  if (!tenant) {
    // No tenant for this gym → we have no token to PATCH with. Wellhub
    // auto-rejects in 15 min. Returning here keeps us out of the DB.
    return { status: "REJECTED", reason: "CLASS_NOT_FOUND" };
  }

  const token = await getWellhubTokenForTenant(tenant.tenantId);

  // IDEMPOTENCY: a booking we have already decided on. Re-PATCH the same
  // decision so a duplicate/redelivered webhook never double-counts.
  const existing = await prisma.platformBooking.findUnique({
    where: { wellhubBookingNumber: data.slot.booking_number },
    select: { status: true, classId: true },
  });
  if (existing) {
    if (existing.status === "cancelled") {
      // Cancellation already arrived (out-of-order). Do NOT resurrect it.
      return { status: "REJECTED", reason: "CLASS_HAS_BEEN_CANCELED" };
    }
    const status: WellhubBookingStatus =
      existing.status === "rejected" ? "REJECTED" : "RESERVED";
    const reason = existing.status === "rejected" ? "CLASS_IS_FULL" : undefined;
    await safePatch(data.slot.gym_id, data.slot.booking_number, status, reason, token);
    return { status, reason };
  }

  const cls = await prisma.class.findUnique({
    where: { wellhubSlotId: data.slot.id },
    select: { id: true, tenantId: true, status: true },
  });

  // No matching class → reject (can't create a PlatformBooking, classId is FK).
  if (!cls || cls.tenantId !== tenant.tenantId) {
    await safePatch(
      data.slot.gym_id,
      data.slot.booking_number,
      "REJECTED",
      "CLASS_NOT_FOUND",
      token,
    );
    return { status: "REJECTED", reason: "CLASS_NOT_FOUND" };
  }
  if (cls.status === "CANCELLED") {
    await safePatch(
      data.slot.gym_id,
      data.slot.booking_number,
      "REJECTED",
      "CLASS_HAS_BEEN_CANCELED",
      token,
    );
    return { status: "REJECTED", reason: "CLASS_HAS_BEEN_CANCELED" };
  }

  // Atomic reserve + row creation. Returns the decision.
  const confirmationDeadline = new Date(data.timestamp + CONFIRMATION_SLA_MS);
  const decision = await reserveAndRecord({
    tenantId: tenant.tenantId,
    classId: cls.id,
    bookingNumber: data.slot.booking_number,
    slotId: data.slot.id,
    uniqueToken: data.user.unique_token,
    memberName: data.user.name ?? null,
    guestEmail: data.user.email ?? null,
    confirmationDeadline,
  });

  // Capture profile data + bridge to a Magic user (best-effort, non-blocking).
  if (data.user.name || data.user.email) {
    await prisma.wellhubUserLink
      .upsert({
        where: {
          tenantId_wellhubUniqueToken: {
            tenantId: tenant.tenantId,
            wellhubUniqueToken: data.user.unique_token,
          },
        },
        create: {
          tenantId: tenant.tenantId,
          wellhubUniqueToken: data.user.unique_token,
          fullName: data.user.name ?? null,
          email: data.user.email ?? null,
        },
        update: {
          ...(data.user.name ? { fullName: data.user.name } : {}),
          ...(data.user.email ? { email: data.user.email } : {}),
        },
      })
      .catch((err) => console.error("[wellhub] userLink upsert failed", err));

    const { tryLinkWellhubUserToMagic } = await import("./matching");
    tryLinkWellhubUserToMagic({
      tenantId: tenant.tenantId,
      wellhubUniqueToken: data.user.unique_token,
    }).catch((err) => console.error("[wellhub] auto-link from booking-requested failed", err));
  }

  // PATCH Wellhub with the decision. A failure here keeps the row in
  // pending_confirmation and rethrows so the route returns 5xx → Wellhub
  // retries, and the SLA sweep cron is a second backstop.
  await patchWellhubBooking(
    data.slot.gym_id,
    data.slot.booking_number,
    { status: decision.status, reason_category: decision.reason },
    token,
  );
  if (decision.status === "RESERVED") {
    await prisma.platformBooking.update({
      where: { wellhubBookingNumber: data.slot.booking_number },
      data: { status: "confirmed", parsedAt: new Date() },
    });
    // Push fresh availability to Wellhub NOW so its total_booked reflects this
    // seat immediately. We own that counter; without this it stays stale (too
    // low) until the next direct booking / cancel / 15-min reconcile cron,
    // leaving a window where Wellhub shows phantom availability on a now-full
    // class and a second member's request gets rejected. Best-effort and
    // awaited (serverless may freeze after the response): the reconcile cron is
    // the backstop, so a failure here must not 5xx the webhook.
    try {
      const { patchWellhubCapacityForClass } = await import("./sync");
      await patchWellhubCapacityForClass(cls.id);
    } catch (err) {
      console.error("[wellhub] capacity re-sync after confirm failed", {
        classId: cls.id,
        err,
      });
    }
  }

  return decision;
}

/**
 * Reserve a seat and record the PlatformBooking in ONE transaction so the
 * quota counter and the row can't diverge. Enforces BOTH the platform quota
 * cap and the shared physical capacity. On RESERVED it also creates a
 * seat-holding companion Booking (guest-style, no charge / credit / revenue)
 * with an auto-assigned spot so the member shows on the spot map, attendance
 * list, and capacity counters like any other booking.
 */
async function reserveAndRecord(args: {
  tenantId: string;
  classId: string;
  bookingNumber: string;
  slotId: number;
  uniqueToken: string;
  memberName: string | null;
  guestEmail: string | null;
  confirmationDeadline: Date;
}): Promise<{ status: WellhubBookingStatus; reason?: WellhubBookingRejectionReason }> {
  return prisma.$transaction(async (tx) => {
    const decision = await decideReservation(tx, args.classId);

    const pb = await tx.platformBooking.create({
      data: {
        tenantId: args.tenantId,
        classId: args.classId,
        platform: "wellhub",
        platformBookingId: args.bookingNumber,
        memberName: args.memberName,
        status: decision.status === "RESERVED" ? "pending_confirmation" : "rejected",
        source: "wellhub_api",
        wellhubBookingNumber: args.bookingNumber,
        wellhubSlotId: args.slotId,
        wellhubUserUniqueToken: args.uniqueToken,
        confirmationDeadline: args.confirmationDeadline,
        rejectionReason: decision.reason ?? null,
      },
      select: { id: true },
    });

    if (decision.status === "RESERVED") {
      const spotNumber = await assignWalkinSpot(tx, args.classId);
      await tx.booking.create({
        data: {
          tenantId: args.tenantId,
          classId: args.classId,
          userId: null,
          guestName: args.memberName ?? `Wellhub ${args.uniqueToken.slice(-4)}`,
          guestEmail: args.guestEmail,
          spotNumber,
          privacy: "PRIVATE",
          status: "CONFIRMED",
          platformBookingId: pb.id,
        },
      });
    }

    return decision;
  });
}

/**
 * Lowest free spot number (1..maxCapacity) not taken by a consuming Booking or
 * a BlockedSpot. Only rooms with a configured spot layout use spot numbers;
 * for spotless rooms the companion is created without a spot (it still holds a
 * seat via the capacity counters). Returns null when no numbered spot is free.
 *
 * Exported as `assignWalkinSpot` for the walk-in path in access-control.ts.
 */
export async function assignWalkinSpot(
  tx: Prisma.TransactionClient,
  classId: string,
): Promise<number | null> {
  const cls = await tx.class.findUnique({
    where: { id: classId },
    select: { room: { select: { maxCapacity: true, layout: true } } },
  });
  const capacity = cls?.room?.maxCapacity ?? 0;
  if (capacity <= 0) return null;

  // Mirror the waitlist-promotion rule: only assign a spot when the room has a
  // spot layout, otherwise the map isn't spot-based and a number is meaningless.
  const layout = cls?.room?.layout as { spots?: unknown[] } | null;
  if (!layout?.spots?.length) return null;

  const [booked, blocked] = await Promise.all([
    tx.booking.findMany({
      where: { classId, status: { in: [...MAGIC_CONSUMING_STATUSES] }, spotNumber: { not: null } },
      select: { spotNumber: true },
    }),
    tx.blockedSpot.findMany({
      where: { classId, spotNumber: { not: null } },
      select: { spotNumber: true },
    }),
  ]);

  const taken = new Set<number>();
  for (const b of booked) if (b.spotNumber != null) taken.add(b.spotNumber);
  for (const b of blocked) if (b.spotNumber != null) taken.add(b.spotNumber);

  for (let i = 1; i <= capacity; i++) {
    if (!taken.has(i)) return i;
  }
  return null;
}

/**
 * Decide RESERVED vs REJECTED inside a transaction. Two gates:
 *   1. Platform quota cap   (bookedSpots < quotaSpots, not closed).
 *   2. Physical room capacity (maxCapacity − magic − blocked − platform > 0).
 * On RESERVED we increment the quota counter atomically within the same txn.
 */
async function decideReservation(
  tx: Prisma.TransactionClient,
  classId: string,
): Promise<{ status: WellhubBookingStatus; reason?: WellhubBookingRejectionReason }> {
  const quota = await tx.schedulePlatformQuota.findUnique({
    where: { classId_platform: { classId, platform: "wellhub" } },
    select: { id: true, quotaSpots: true, bookedSpots: true, isClosedManually: true },
  });

  // Class must exist for the physical-capacity gate.
  const cls = await tx.class.findUnique({
    where: { id: classId },
    select: {
      room: { select: { maxCapacity: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: [...MAGIC_CONSUMING_STATUSES] } } },
          blockedSpots: true,
        },
      },
    },
  });
  if (!cls?.room) {
    return { status: "REJECTED", reason: "CLASS_NOT_FOUND" };
  }
  // Exclude platform rows that already hold a companion Booking: those seats are
  // counted in cls._count.bookings above (a Wellhub reservation creates a
  // seat-holding companion). The companion for THIS booking doesn't exist yet,
  // but companions from OTHER Wellhub reservations do — counting them here too
  // would double-subtract those seats.
  const platformBooked = await tx.platformBooking.count({
    where: { classId, status: { in: PLATFORM_CONSUMING_STATUSES }, companionBooking: { is: null } },
  });
  const physicalSpotsLeft =
    cls.room.maxCapacity - cls._count.bookings - cls._count.blockedSpots - platformBooked;

  // Pure decision: quota cap + physical capacity + closed flag.
  const decision = evaluateReservationDecision({
    quota: quota
      ? {
          quotaSpots: quota.quotaSpots,
          bookedSpots: quota.bookedSpots,
          isClosedManually: quota.isClosedManually,
        }
      : null,
    physicalSpotsLeft,
  });
  if (decision.status !== "RESERVED" || !quota) {
    return decision;
  }

  // Quota cap: conditional increment, race-safe in Postgres. If a concurrent
  // request won the last slot, this fails and we reject.
  const result = await tx.schedulePlatformQuota.updateMany({
    where: {
      id: quota.id,
      bookedSpots: { lt: quota.quotaSpots },
      isClosedManually: false,
    },
    data: { bookedSpots: { increment: 1 } },
  });
  if (result.count === 0) {
    return { status: "REJECTED", reason: "CLASS_IS_FULL" };
  }

  return { status: "RESERVED" };
}

/** PATCH that swallows errors (used on reject paths where we don't retry). */
async function safePatch(
  gymId: number,
  bookingNumber: string,
  status: WellhubBookingStatus,
  reason: WellhubBookingRejectionReason | undefined,
  token: string,
): Promise<void> {
  try {
    await patchWellhubBooking(gymId, bookingNumber, { status, reason_category: reason }, token);
  } catch (error) {
    console.error("[wellhub] safePatch failed", { bookingNumber, status, reason, error });
  }
}

// ─── Event handler: booking-canceled / booking-late-canceled ──────────────

/**
 * Process a cancellation. CRITICAL for revenue: freeing the seat must cascade
 * so the spot is immediately reusable by ANY channel.
 *
 * Steps (idempotent — a duplicate webhook is a safe no-op):
 *   1. Mark the PlatformBooking cancelled (only if it was consuming).
 *   2. Decrement the platform quota counter.
 *   3. Promote the Magic waitlist + notify spot-watchers.
 *   4. Re-sync Wellhub's total_booked so their app reflects the opening.
 *
 * Out-of-order safety: if the booking doesn't exist yet (cancel before
 * request), we write a `cancelled` tombstone so the later request can't
 * resurrect it.
 */
export async function processBookingCanceled(
  event: WellhubBookingCanceledEvent | WellhubBookingLateCanceledEvent,
  opts: { late: boolean },
): Promise<{ updated: boolean; freedSeat: boolean }> {
  const { event_data: data } = event;

  const booking = await prisma.platformBooking.findUnique({
    where: { wellhubBookingNumber: data.slot.booking_number },
    select: { id: true, classId: true, status: true, tenantId: true },
  });

  // Out-of-order: cancel arrived before request. Write a tombstone so the
  // forthcoming booking-requested is rejected as already-cancelled.
  if (!booking) {
    const tenant = await resolveTenantByWellhubGymId(data.slot.gym_id);
    const cls = await prisma.class.findUnique({
      where: { wellhubSlotId: data.slot.id },
      select: { id: true, tenantId: true },
    });
    if (tenant && cls && cls.tenantId === tenant.tenantId) {
      await prisma.platformBooking
        .create({
          data: {
            tenantId: tenant.tenantId,
            classId: cls.id,
            platform: "wellhub",
            platformBookingId: data.slot.booking_number,
            status: "cancelled",
            source: "wellhub_api",
            wellhubBookingNumber: data.slot.booking_number,
            wellhubSlotId: data.slot.id,
            wellhubUserUniqueToken: data.user.unique_token,
            notes: opts.late ? "wellhub_late_cancel_tombstone" : "wellhub_cancel_tombstone",
          },
        })
        .catch((err) => console.error("[wellhub] cancel tombstone create failed", err));
    }
    return { updated: false, freedSeat: false };
  }

  // Idempotency: already cancelled → no-op (no double-decrement, no re-promote).
  if (booking.status === "cancelled") {
    return { updated: false, freedSeat: false };
  }

  const wasConsuming = (
    ["confirmed", "checked_in", "pending_confirmation"] as PlatformBookingStatus[]
  ).includes(booking.status);

  // Mark cancelled + decrement quota + free the companion seat in one txn.
  await prisma.$transaction(async (tx) => {
    await tx.platformBooking.update({
      where: { id: booking.id },
      data: {
        status: "cancelled",
        notes: opts.late ? "wellhub_late_cancel" : "wellhub_cancel",
      },
    });
    if (wasConsuming) {
      await tx.schedulePlatformQuota.updateMany({
        where: { classId: booking.classId, platform: "wellhub", bookedSpots: { gt: 0 } },
        data: { bookedSpots: { decrement: 1 } },
      });
    }
    // Release the seat-holding companion Booking so its spot frees up. The FK
    // is ON DELETE CASCADE, but we delete explicitly to free the spot now (the
    // PlatformBooking row is kept for history as a cancelled record).
    await tx.booking.deleteMany({ where: { platformBookingId: booking.id } });
  });

  // Only cascade when a seat actually opened.
  if (wasConsuming) {
    await cascadeFreedSeat(booking.classId, booking.tenantId);
  }

  return { updated: true, freedSeat: wasConsuming };
}

/**
 * A seat just opened on this class. Promote the Magic waitlist, notify
 * spot-watchers, and push fresh availability to Wellhub. Best-effort: each
 * step is independent and logged on failure; never throws.
 */
export async function cascadeFreedSeat(classId: string, tenantId: string): Promise<void> {
  try {
    await promoteFromWaitlist(classId, tenantId);
  } catch (err) {
    console.error("[wellhub] waitlist promotion after cancel failed", { classId, err });
  }
  try {
    await notifySpotWatchers(classId, tenantId);
  } catch (err) {
    console.error("[wellhub] spot-watcher notify after cancel failed", { classId, err });
  }
  try {
    const { patchWellhubCapacityForClass } = await import("./sync");
    await patchWellhubCapacityForClass(classId);
  } catch (err) {
    console.error("[wellhub] capacity re-sync after cancel failed", { classId, err });
  }
}

// ─── Event handler: checkin-booking-occurred ──────────────────────────────

/**
 * Wellhub fires this *after* a member with a pending booking does their app
 * check-in. We mark the local PlatformBooking as `checked_in` so the admin
 * dashboard reflects it in real-time. The Access Control validate call (which
 * actually triggers payment to the studio) is handled separately by the
 * `checkin` webhook + Automated Trigger flow in `access-control.ts`.
 */
export async function processCheckinBookingOccurred(
  event: WellhubCheckinBookingOccurredEvent,
): Promise<{ updated: boolean }> {
  const { event_data: data } = event;

  const booking = await prisma.platformBooking.findUnique({
    where: { wellhubBookingNumber: data.booking.booking_number },
    select: { id: true, status: true },
  });
  if (!booking) return { updated: false };

  // Don't move a cancelled booking back to checked_in (out-of-order safety).
  if (booking.status === "cancelled") return { updated: false };

  await prisma.platformBooking.update({
    where: { id: booking.id },
    data: {
      status: "checked_in",
      checkedInAt: new Date(data.timestamp * 1000),
    },
  });
  // Keep the companion seat in sync so attendance lists mark them present.
  await syncCompanionStatus(booking.id, "ATTENDED");
  return { updated: true };
}

/**
 * Mirror a PlatformBooking's status onto its seat-holding companion Booking so
 * the spot map and attendance list stay in sync. Called from every check-in
 * path (webhook, automated trigger, manual admin). No-op when there's no
 * companion (email-sourced rows, spotless flows).
 */
export async function syncCompanionStatus(
  platformBookingId: string,
  status: "CONFIRMED" | "ATTENDED" | "NO_SHOW",
): Promise<void> {
  await prisma.booking.updateMany({
    where: { platformBookingId },
    data: { status },
  });
}

export const __SLA_INTERNAL = {
  CONFIRMATION_SLA_MS,
};
