// Access Control API: validate Wellhub check-ins and manage the per-(gym,user)
// custom_code that lets returning members enter offline via RFID/PIN/QR.
//
// The mandatory Automated Trigger flow lives here too: when the `checkin`
// webhook fires we synchronously call /access/v1/validate, which is what
// triggers payment to the partner. Without that call Wellhub treats the visit
// as unverified.

import { prisma } from "@/lib/db";
import { accessApi, getWellhubTokenForTenant } from "./client";
import { WellhubApiError } from "./errors";
import { tryLinkWellhubUserToMagic } from "./matching";
import { resolveTenantByWellhubGymId } from "./resolve";
import type {
  WellhubCheckinEvent,
  WellhubValidateResponse,
} from "./types";

// ─── /access/v1/validate ──────────────────────────────────────────────────

export async function validateWellhubCheckin(
  opts: {
    gymId: number;
    wellhubId: string;       // gympass_id / unique_token (13 chars)
    customCode?: string;
  },
  token: string,
): Promise<WellhubValidateResponse> {
  return accessApi<WellhubValidateResponse>("/access/v1/validate", {
    method: "POST",
    gymId: opts.gymId,
    body: {
      gympass_id: opts.wellhubId,
      ...(opts.customCode ? { custom_code: opts.customCode } : {}),
    },
    token,
  });
}

// ─── Custom code lifecycle (POST/PUT/DELETE /access/v1/code/:wellhub_id) ──

export function createWellhubCustomCode(
  opts: {
    gymId: number;
    wellhubId: string;
    customCode: string;
  },
  token: string,
): Promise<void> {
  return accessApi<void>(`/access/v1/code/${encodeURIComponent(opts.wellhubId)}`, {
    method: "POST",
    gymId: opts.gymId,
    body: { custom_code: opts.customCode },
    token,
  });
}

export function updateWellhubCustomCode(
  opts: {
    gymId: number;
    wellhubId: string;
    customCode: string;
  },
  token: string,
): Promise<void> {
  return accessApi<void>(`/access/v1/code/${encodeURIComponent(opts.wellhubId)}`, {
    method: "PUT",
    gymId: opts.gymId,
    body: { custom_code: opts.customCode },
    token,
  });
}

export function deleteWellhubCustomCode(
  opts: {
    gymId: number;
    wellhubId: string;
  },
  token: string,
): Promise<void> {
  return accessApi<void>(`/access/v1/code/${encodeURIComponent(opts.wellhubId)}`, {
    method: "DELETE",
    gymId: opts.gymId,
    token,
  });
}

// ─── Helper: unify Magic check-in with Wellhub validate ───────────────────

/**
 * Called from the standard Magic check-in flow. If a Wellhub PlatformBooking
 * exists for (classId, memberId) — i.e. this member came via Wellhub — we
 * call /access/v1/validate and mark the PlatformBooking checked_in. Safe to
 * call for any check-in; returns `{ validated: false, reason: "not_wellhub" }`
 * when the member did not come via Wellhub.
 */
export async function validateWellhubVisitForCheckin(opts: {
  tenantId: string;
  classId: string;
  memberId?: string;
  /** Optional override when the coach scans a Wellhub QR directly. */
  wellhubUniqueToken?: string;
  customCode?: string;
}): Promise<{ validated: boolean; reason?: string; platformBookingId?: string }> {
  const config = await prisma.studioPlatformConfig.findFirst({
    where: { tenantId: opts.tenantId, platform: "wellhub" },
    select: { wellhubGymId: true, wellhubMode: true },
  });
  if (!config?.wellhubGymId || config.wellhubMode !== "api") {
    return { validated: false, reason: "wellhub_not_active" };
  }

  // Resolve the unique_token from memberId (via WellhubUserLink) if not given.
  let uniqueToken = opts.wellhubUniqueToken;
  if (!uniqueToken && opts.memberId) {
    const link = await prisma.wellhubUserLink.findFirst({
      where: { tenantId: opts.tenantId, userId: opts.memberId },
      select: { wellhubUniqueToken: true },
    });
    uniqueToken = link?.wellhubUniqueToken;
  }
  if (!uniqueToken) {
    return { validated: false, reason: "not_wellhub" };
  }

  // Find the matching PlatformBooking for this class (most recent).
  const platformBooking = await prisma.platformBooking.findFirst({
    where: {
      tenantId: opts.tenantId,
      classId: opts.classId,
      platform: "wellhub",
      wellhubUserUniqueToken: uniqueToken,
      status: { in: ["confirmed", "pending_confirmation"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const token = await getWellhubTokenForTenant(opts.tenantId);

  try {
    await validateWellhubCheckin(
      {
        gymId: config.wellhubGymId,
        wellhubId: uniqueToken,
        customCode: opts.customCode,
      },
      token,
    );
  } catch (error) {
    if (error instanceof WellhubApiError && error.isNotFound) {
      // No active Wellhub check-in to validate — member may not have
      // checked in on the Wellhub app yet. Don't fail the Magic check-in.
      return { validated: false, reason: "no_wellhub_checkin", platformBookingId: platformBooking?.id };
    }
    throw error;
  }

  if (platformBooking) {
    await prisma.platformBooking.update({
      where: { id: platformBooking.id },
      data: { status: "checked_in", checkedInAt: new Date() },
    });
    const { syncCompanionStatus } = await import("./bookings");
    await syncCompanionStatus(platformBooking.id, "ATTENDED");
  }

  await prisma.wellhubUserLink.updateMany({
    where: { tenantId: opts.tenantId, wellhubUniqueToken: uniqueToken },
    data: { lastValidatedAt: new Date() },
  });

  return { validated: true, platformBookingId: platformBooking?.id };
}

// ─── Webhook handler: `checkin` (Automated Trigger) ───────────────────────

/**
 * Synchronously called from the `checkin` webhook route.
 *
 * Side effects:
 *   1. Upserts a `WellhubUserLink` so future visits can use custom_code.
 *   2. Calls POST /access/v1/validate (Automated Trigger requirement).
 *   3. Tries to match the visit to a `PlatformBooking` (if the user had
 *      booked the class ahead of time) and marks it as checked_in.
 */
export async function processCheckinWebhook(
  event: WellhubCheckinEvent,
): Promise<{
  validated: boolean;
  reason?: string;
}> {
  const { event_data: data } = event;
  const tenant = await resolveTenantByWellhubGymId(data.gym.id);
  if (!tenant) return { validated: false, reason: "no_tenant_for_gym" };

  // 1) Maintain the user mapping. The checkin webhook is our richest source
  // for profile data (first/last name, email, phone) — capture everything we
  // get so admin/coach roster surfaces a real person instead of a 13-digit id.
  const profile = {
    firstName: data.user.first_name ?? null,
    lastName: data.user.last_name ?? null,
    email: data.user.email ?? null,
    phone: data.user.phone_number ?? null,
    fullName: [data.user.first_name, data.user.last_name].filter(Boolean).join(" ").trim() || null,
  };
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
      lastValidatedAt: new Date(data.timestamp * 1000),
      ...profile,
    },
    update: {
      lastValidatedAt: new Date(data.timestamp * 1000),
      // Only overwrite when the incoming payload actually has a value; never
      // wipe data we already captured.
      ...(profile.firstName ? { firstName: profile.firstName } : {}),
      ...(profile.lastName ? { lastName: profile.lastName } : {}),
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.phone ? { phone: profile.phone } : {}),
      ...(profile.fullName ? { fullName: profile.fullName } : {}),
    },
  });

  // Attempt to bridge to an existing Magic User. Non-blocking; failures are
  // logged but never break the validate flow.
  tryLinkWellhubUserToMagic({
    tenantId: tenant.tenantId,
    wellhubUniqueToken: data.user.unique_token,
  }).catch((err) => console.error("[wellhub] auto-link from checkin failed", err));

  // 2) Automated Trigger: validate to actually generate the payment.
  const token = await getWellhubTokenForTenant(tenant.tenantId);
  try {
    await validateWellhubCheckin(
      {
        gymId: data.gym.id,
        wellhubId: data.user.unique_token,
      },
      token,
    );
  } catch (error) {
    if (error instanceof WellhubApiError && error.isNotFound) {
      // Check-in not yet propagated on Wellhub's side; safe to skip and let
      // the manual UI retry if needed.
      return { validated: false, reason: "checkin_not_found_in_wellhub" };
    }
    throw error;
  }

  // 3) Resolve which class this check-in belongs to. The `checkin` webhook
  // doesn't carry a class/booking, so we match by time (see checkin-match.ts).
  const checkinAt = new Date(data.timestamp * 1000);
  const resolution = await resolveCheckinToClass({
    tenantId: tenant.tenantId,
    uniqueToken: data.user.unique_token,
    gymId: data.gym.id,
    productId: data.gym.product?.id ?? null,
    checkinAt,
  });

  if (resolution.kind === "reservation" || resolution.kind === "walkin") {
    return { validated: true, reason: resolution.kind };
  }
  // No class matched → record visit (already done above) + alert the front-desk.
  return { validated: true, reason: "unmatched_no_class" };
}

/**
 * Decide which class a Wellhub check-in belongs to, and apply it.
 *
 * Path 1 — reservation: the member already booked. Among THEIR confirmed
 *          bookings, pick the class closest to the check-in time and mark it.
 * Path 2 — walk-in: no reservation matches. Among ALL studio classes for the
 *          check-in's product, pick the closest and auto-create a
 *          reservation + seat (NOT gated by quota — a consummated check-in is
 *          a fact, not a request).
 * Fallback — neither matches: create an unmatched_checkin alert.
 */
async function resolveCheckinToClass(args: {
  tenantId: string;
  uniqueToken: string;
  gymId: number;
  productId: number | null;
  checkinAt: Date;
}): Promise<{ kind: "reservation" | "walkin" | "unmatched" }> {
  const { pickClosestClass } = await import("./checkin-match");
  const { syncCompanionStatus } = await import("./bookings");

  // ── Path 1: existing reservation ────────────────────────────────────────
  const reservations = await prisma.platformBooking.findMany({
    where: {
      tenantId: args.tenantId,
      platform: "wellhub",
      wellhubUserUniqueToken: args.uniqueToken,
      status: { in: ["confirmed", "pending_confirmation"] },
    },
    select: { id: true, class: { select: { id: true, startsAt: true, endsAt: true } } },
  });

  if (reservations.length > 0) {
    const matched = pickClosestClass(
      reservations.map((r) => ({ id: r.id, startsAt: r.class.startsAt, endsAt: r.class.endsAt })),
      args.checkinAt,
    );
    if (matched.match) {
      await prisma.platformBooking.update({
        where: { id: matched.match.id },
        data: { status: "checked_in", checkedInAt: args.checkinAt },
      });
      await syncCompanionStatus(matched.match.id, "ATTENDED");
      return { kind: "reservation" };
    }
    // Reservations exist but none in the time window → fall through to walk-in
    // matching (e.g. they checked in for a class they didn't book).
  }

  // ── Path 2: walk-in (no matching reservation) ───────────────────────────
  // Candidate classes: this tenant's classes mapped to the check-in's product,
  // around the check-in time. We bound the SQL window generously and let the
  // pure matcher apply the exact acceptance window.
  const windowStart = new Date(args.checkinAt.getTime() - 3 * 60 * 60 * 1000);
  const windowEnd = new Date(args.checkinAt.getTime() + 3 * 60 * 60 * 1000);
  const candidateClasses = await prisma.class.findMany({
    where: {
      tenantId: args.tenantId,
      status: "SCHEDULED",
      startsAt: { gte: windowStart, lte: windowEnd },
      ...(args.productId
        ? { classType: { wellhubProductId: args.productId } }
        : { classType: { wellhubProductId: { not: null } } }),
    },
    select: { id: true, startsAt: true, endsAt: true },
  });

  const walkinMatch = pickClosestClass(candidateClasses, args.checkinAt);
  if (walkinMatch.match) {
    await createWalkinBooking({
      tenantId: args.tenantId,
      classId: walkinMatch.match.id,
      uniqueToken: args.uniqueToken,
      checkinAt: args.checkinAt,
    });
    return { kind: "walkin" };
  }

  // ── Fallback: nothing matched → alert for manual assignment ─────────────
  const { createPlatformAlert } = await import("@/lib/platforms/alerts");
  await createPlatformAlert({
    tenantId: args.tenantId,
    platform: "wellhub",
    type: "unmatched_checkin",
  }).catch((err) => console.error("[wellhub] unmatched_checkin alert failed", err));
  return { kind: "unmatched" };
}

/**
 * Create a walk-in: a Wellhub member who checked in without a reservation.
 * NOT gated by quota — they're physically here and Wellhub already validated
 * the visit. Idempotent on (token, class): a duplicate webhook won't double-seat.
 */
async function createWalkinBooking(args: {
  tenantId: string;
  classId: string;
  uniqueToken: string;
  checkinAt: Date;
}): Promise<void> {
  // Idempotency: if this user already has a (non-cancelled) wellhub booking on
  // this class, just ensure it's checked_in instead of creating a second one.
  const existing = await prisma.platformBooking.findFirst({
    where: {
      tenantId: args.tenantId,
      classId: args.classId,
      platform: "wellhub",
      wellhubUserUniqueToken: args.uniqueToken,
      status: { not: "cancelled" },
    },
    select: { id: true },
  });
  const { syncCompanionStatus } = await import("./bookings");
  if (existing) {
    await prisma.platformBooking.update({
      where: { id: existing.id },
      data: { status: "checked_in", checkedInAt: args.checkinAt },
    });
    await syncCompanionStatus(existing.id, "ATTENDED");
    return;
  }

  const link = await prisma.wellhubUserLink.findFirst({
    where: { tenantId: args.tenantId, wellhubUniqueToken: args.uniqueToken },
    select: { fullName: true, email: true },
  });
  const memberName =
    link?.fullName ?? `Wellhub ${args.uniqueToken.slice(-4)} (walk-in)`;

  const { assignWalkinSpot } = await import("./bookings");

  await prisma.$transaction(async (tx) => {
    const pb = await tx.platformBooking.create({
      data: {
        tenantId: args.tenantId,
        classId: args.classId,
        platform: "wellhub",
        platformBookingId: `walkin_${args.uniqueToken}_${args.classId}`,
        memberName,
        status: "checked_in",
        source: "wellhub_api",
        wellhubUserUniqueToken: args.uniqueToken,
        checkedInAt: args.checkinAt,
        notes: "wellhub_walkin",
      },
      select: { id: true },
    });

    const spot = await assignWalkinSpot(tx, args.classId);
    await tx.booking.create({
      data: {
        tenantId: args.tenantId,
        classId: args.classId,
        userId: null,
        guestName: memberName,
        guestEmail: link?.email ?? null,
        spotNumber: spot,
        privacy: "PRIVATE",
        status: "ATTENDED",
        platformBookingId: pb.id,
      },
    });
  });
}
