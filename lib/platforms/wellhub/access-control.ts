// Access Control API: validate Wellhub check-ins and manage the per-(gym,user)
// custom_code that lets returning members enter offline via RFID/PIN/QR.
//
// The mandatory Automated Trigger flow lives here too: when the `checkin`
// webhook fires we synchronously call /access/v1/validate, which is what
// triggers payment to the partner. Without that call Wellhub treats the visit
// as unverified.

import { prisma } from "@/lib/db";
import { accessApi } from "./client";
import { WellhubApiError } from "./errors";
import { tryLinkWellhubUserToMagic } from "./matching";
import { resolveTenantByWellhubGymId } from "./resolve";
import type {
  WellhubCheckinEvent,
  WellhubValidateResponse,
} from "./types";

// ─── /access/v1/validate ──────────────────────────────────────────────────

export async function validateWellhubCheckin(opts: {
  gymId: number;
  wellhubId: string;       // gympass_id / unique_token (13 chars)
  customCode?: string;
}): Promise<WellhubValidateResponse> {
  return accessApi<WellhubValidateResponse>("/access/v1/validate", {
    method: "POST",
    gymId: opts.gymId,
    body: {
      gympass_id: opts.wellhubId,
      ...(opts.customCode ? { custom_code: opts.customCode } : {}),
    },
  });
}

// ─── Custom code lifecycle (POST/PUT/DELETE /access/v1/code/:wellhub_id) ──

export function createWellhubCustomCode(opts: {
  gymId: number;
  wellhubId: string;
  customCode: string;
}): Promise<void> {
  return accessApi<void>(`/access/v1/code/${encodeURIComponent(opts.wellhubId)}`, {
    method: "POST",
    gymId: opts.gymId,
    body: { custom_code: opts.customCode },
  });
}

export function updateWellhubCustomCode(opts: {
  gymId: number;
  wellhubId: string;
  customCode: string;
}): Promise<void> {
  return accessApi<void>(`/access/v1/code/${encodeURIComponent(opts.wellhubId)}`, {
    method: "PUT",
    gymId: opts.gymId,
    body: { custom_code: opts.customCode },
  });
}

export function deleteWellhubCustomCode(opts: {
  gymId: number;
  wellhubId: string;
}): Promise<void> {
  return accessApi<void>(`/access/v1/code/${encodeURIComponent(opts.wellhubId)}`, {
    method: "DELETE",
    gymId: opts.gymId,
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

  try {
    await validateWellhubCheckin({
      gymId: config.wellhubGymId,
      wellhubId: uniqueToken,
      customCode: opts.customCode,
    });
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
  try {
    await validateWellhubCheckin({
      gymId: data.gym.id,
      wellhubId: data.user.unique_token,
    });
  } catch (error) {
    if (error instanceof WellhubApiError && error.isNotFound) {
      // Check-in not yet propagated on Wellhub's side; safe to skip and let
      // the manual UI retry if needed.
      return { validated: false, reason: "checkin_not_found_in_wellhub" };
    }
    throw error;
  }

  // 3) Best-effort: link to an existing PlatformBooking if one exists.
  const booking = await prisma.platformBooking.findFirst({
    where: {
      tenantId: tenant.tenantId,
      platform: "wellhub",
      wellhubUserUniqueToken: data.user.unique_token,
      status: { in: ["confirmed", "pending_confirmation"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (booking) {
    await prisma.platformBooking.update({
      where: { id: booking.id },
      data: { status: "checked_in", checkedInAt: new Date(data.timestamp * 1000) },
    });
  }

  return { validated: true };
}
