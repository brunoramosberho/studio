// Inbound booking lifecycle: requested → confirmed/rejected → cancelled/checked-in.
//
// The critical contract is the **15-minute SLA** on `booking-requested`: if we
// don't PATCH /booking/v2/.../bookings/:booking_number within that window,
// Wellhub auto-rejects. The webhook route should respond 200 quickly and call
// `processBookingRequested` synchronously inside the request (the work below
// is small and fast: one DB transaction + one outbound PATCH).

import type { PlatformBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { bookingApi } from "./client";
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
): Promise<void> {
  return bookingApi<void>(
    `/booking/v2/gyms/${gymId}/bookings/${encodeURIComponent(bookingNumber)}`,
    { method: "PATCH", body: payload },
  );
}

// ─── Event handler: booking-requested ─────────────────────────────────────

/**
 * Processes a `booking-requested` webhook end-to-end:
 *   1. Resolve tenant + class by `gym_id` + `slot.id`.
 *   2. Reserve in our DB (idempotent on `wellhubBookingNumber`).
 *   3. Decide RESERVED vs REJECTED based on quota.
 *   4. PATCH Wellhub with the decision.
 *
 * On any pre-PATCH error, the row stays `pending_confirmation` and the SLA
 * sweep cron retries. On a PATCH-time error we keep the booking pending too;
 * the cron will re-issue the PATCH.
 */
export async function processBookingRequested(
  event: WellhubBookingRequestedEvent,
): Promise<{ status: WellhubBookingStatus; reason?: WellhubBookingRejectionReason }> {
  const { event_data: data } = event;
  const tenant = await resolveTenantByWellhubGymId(data.slot.gym_id);
  if (!tenant) {
    // Without a tenant we cannot record the booking. Best effort: tell Wellhub
    // the class wasn't found so they reject cleanly.
    try {
      await patchWellhubBooking(data.slot.gym_id, data.slot.booking_number, {
        status: "REJECTED",
        reason_category: "CLASS_NOT_FOUND",
        reason: "Gym not linked to this CMS",
      });
    } catch {
      // Swallow: there's nothing we can do. Wellhub will auto-reject in 15 min.
    }
    return { status: "REJECTED", reason: "CLASS_NOT_FOUND" };
  }

  const cls = await prisma.class.findUnique({
    where: { wellhubSlotId: data.slot.id },
    select: { id: true, tenantId: true, status: true, startsAt: true },
  });

  // Decide outcome before touching our DB so we never store an orphan row.
  let decision: { status: WellhubBookingStatus; reason?: WellhubBookingRejectionReason };

  if (!cls || cls.tenantId !== tenant.tenantId) {
    decision = { status: "REJECTED", reason: "CLASS_NOT_FOUND" };
  } else if (cls.status === "CANCELLED") {
    decision = { status: "REJECTED", reason: "CLASS_HAS_BEEN_CANCELED" };
  } else {
    decision = await reserveSpotOrReject(cls.id);
  }

  // No matching class → we cannot create a PlatformBooking (classId is FK).
  // Just PATCH Wellhub to reject and return.
  if (!cls || decision.reason === "CLASS_NOT_FOUND") {
    try {
      await patchWellhubBooking(data.slot.gym_id, data.slot.booking_number, {
        status: "REJECTED",
        reason_category: decision.reason ?? "CLASS_NOT_FOUND",
      });
    } catch (error) {
      console.error("[wellhub] PATCH (class-not-found) failed", { error });
    }
    return decision;
  }

  const confirmationDeadline = new Date(event.event_data.timestamp + CONFIRMATION_SLA_MS);

  // Capture any profile data the booking webhook carries — Wellhub may or may
  // not send name/email at this stage; the canonical source is the `checkin`
  // webhook later, but we save whatever we get so the admin sees a name now.
  if (data.user.name || data.user.email) {
    await prisma.wellhubUserLink.upsert({
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
    });

    // Bridge to existing Magic User if email matches — feeds the conversion
    // funnel without blocking the booking decision.
    const { tryLinkWellhubUserToMagic } = await import("./matching");
    tryLinkWellhubUserToMagic({
      tenantId: tenant.tenantId,
      wellhubUniqueToken: data.user.unique_token,
    }).catch((err) => console.error("[wellhub] auto-link from booking-requested failed", err));
  }

  // Record the booking attempt. Idempotent on wellhubBookingNumber.
  await prisma.platformBooking.upsert({
    where: { wellhubBookingNumber: data.slot.booking_number },
    create: {
      tenantId: tenant.tenantId,
      classId: cls.id,
      platform: "wellhub",
      platformBookingId: data.slot.booking_number,
      memberName: data.user.name ?? null,
      status: decision.status === "RESERVED" ? "pending_confirmation" : "rejected",
      source: "wellhub_api",
      wellhubBookingNumber: data.slot.booking_number,
      wellhubSlotId: data.slot.id,
      wellhubUserUniqueToken: data.user.unique_token,
      confirmationDeadline,
      rejectionReason: decision.reason ?? null,
    },
    update: {
      // Re-delivery from Wellhub: keep the existing row, only refresh deadline.
      confirmationDeadline,
    },
  });

  // PATCH Wellhub. Failures keep the row pending so the cron can retry.
  try {
    await patchWellhubBooking(data.slot.gym_id, data.slot.booking_number, {
      status: decision.status,
      reason_category: decision.reason,
    });
    if (decision.status === "RESERVED") {
      await prisma.platformBooking.update({
        where: { wellhubBookingNumber: data.slot.booking_number },
        data: { status: "confirmed", parsedAt: new Date() },
      });
    }
  } catch (error) {
    // Leave the row pending; sweep cron will retry. Surface for observability.
    console.error("[wellhub] PATCH booking failed", {
      bookingNumber: data.slot.booking_number,
      decision,
      error,
    });
  }

  return decision;
}

/**
 * Single-statement quota reservation. Uses Postgres' check on the update WHERE
 * clause so two concurrent reservations cannot oversell — the loser fails the
 * update and we reject as CLASS_IS_FULL.
 */
async function reserveSpotOrReject(
  classId: string,
): Promise<{ status: WellhubBookingStatus; reason?: WellhubBookingRejectionReason }> {
  const quota = await prisma.schedulePlatformQuota.findUnique({
    where: { classId_platform: { classId, platform: "wellhub" } },
    select: { id: true, quotaSpots: true, bookedSpots: true, isClosedManually: true },
  });

  if (!quota || quota.quotaSpots === 0) {
    return { status: "REJECTED", reason: "CLASS_IS_FULL" };
  }
  if (quota.isClosedManually) {
    return { status: "REJECTED", reason: "SPOT_NOT_AVAILABLE" };
  }

  // Conditional increment: only succeeds if there's room. Race-safe in Postgres.
  const result = await prisma.schedulePlatformQuota.updateMany({
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

// ─── Event handler: booking-canceled / booking-late-canceled ──────────────

export async function processBookingCanceled(
  event: WellhubBookingCanceledEvent | WellhubBookingLateCanceledEvent,
  opts: { late: boolean },
): Promise<{ updated: boolean }> {
  const { event_data: data } = event;

  const booking = await prisma.platformBooking.findUnique({
    where: { wellhubBookingNumber: data.slot.booking_number },
    select: { id: true, classId: true, status: true, tenantId: true },
  });
  if (!booking) return { updated: false };

  // Free the quota only if the booking still occupies it.
  const consumes: PlatformBookingStatus[] = ["confirmed", "checked_in", "pending_confirmation"];
  if (consumes.includes(booking.status)) {
    await prisma.schedulePlatformQuota.updateMany({
      where: {
        classId: booking.classId,
        platform: "wellhub",
        bookedSpots: { gt: 0 },
      },
      data: { bookedSpots: { decrement: 1 } },
    });
  }

  await prisma.platformBooking.update({
    where: { id: booking.id },
    data: {
      status: "cancelled",
      notes: opts.late ? "wellhub_late_cancel" : "wellhub_cancel",
    },
  });

  return { updated: true };
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
    select: { id: true },
  });
  if (!booking) return { updated: false };

  await prisma.platformBooking.update({
    where: { id: booking.id },
    data: {
      status: "checked_in",
      checkedInAt: new Date(data.timestamp * 1000),
    },
  });
  return { updated: true };
}

export const __SLA_INTERNAL = {
  CONFIRMATION_SLA_MS,
};
