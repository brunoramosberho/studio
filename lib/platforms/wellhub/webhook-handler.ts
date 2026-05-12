// Shared pre-processing for Wellhub webhook routes.
//
// Wellhub signs the request body with HMAC-SHA1 using a per-(gym, event)
// secret that we registered via the Setup API. The flow per request:
//   1. Read raw body (untrusted but harmless to JSON.parse).
//   2. Extract gym_id from the parsed payload.
//   3. Look up the tenant's StudioPlatformConfig by wellhubGymId.
//   4. Decrypt that tenant's `wellhubWebhookSecret`.
//   5. Verify the signature header against the raw body.
//   6. Hand the typed event back to the route handler.

import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/encryption";
import { verifySignature } from "./webhooks";
import { resolveTenantByWellhubGymId } from "./resolve";
import type {
  WellhubBookingCanceledEvent,
  WellhubBookingLateCanceledEvent,
  WellhubBookingRequestedEvent,
  WellhubCheckinBookingOccurredEvent,
  WellhubCheckinEvent,
  WellhubSystemIntegrationRequestedEvent,
} from "./types";

const HEADER = "x-gympass-signature";

export type WellhubWebhookFailure =
  | { ok: false; status: 400; reason: "invalid_json" | "missing_gym_id" }
  | { ok: false; status: 401; reason: "invalid_signature" | "missing_signature" }
  | { ok: false; status: 404; reason: "tenant_not_found" }
  | { ok: false; status: 409; reason: "tenant_missing_secret" };

type EventWithGymId =
  | WellhubBookingRequestedEvent
  | WellhubBookingCanceledEvent
  | WellhubBookingLateCanceledEvent
  | WellhubCheckinBookingOccurredEvent
  | WellhubCheckinEvent;

export type WellhubWebhookSuccess<E> = {
  ok: true;
  event: E;
  tenantId: string;
  gymId: number;
};

/**
 * Extracts the gym_id from any of the per-gym Wellhub webhook payloads.
 *
 * - booking-* events: `event_data.slot.gym_id`
 * - checkin-booking-occurred / checkin: `event_data.gym.id`
 */
function extractGymId(parsed: EventWithGymId): number | null {
  const data = parsed.event_data as unknown as Record<string, unknown>;
  const slot = data.slot as { gym_id?: number } | undefined;
  if (slot?.gym_id !== undefined) return slot.gym_id;
  const gym = data.gym as { id?: number } | undefined;
  if (gym?.id !== undefined) return gym.id;
  return null;
}

/**
 * Validates an inbound per-gym webhook and returns the parsed event.
 * The route handler can then call the corresponding `process*` function.
 */
export async function verifyAndParseGymWebhook<E extends EventWithGymId>(
  request: NextRequest,
): Promise<WellhubWebhookSuccess<E> | WellhubWebhookFailure> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get(HEADER);

  if (!signatureHeader) {
    return { ok: false, status: 401, reason: "missing_signature" };
  }

  let parsed: EventWithGymId;
  try {
    parsed = JSON.parse(rawBody) as EventWithGymId;
  } catch {
    return { ok: false, status: 400, reason: "invalid_json" };
  }

  const gymId = extractGymId(parsed);
  if (gymId === null) {
    return { ok: false, status: 400, reason: "missing_gym_id" };
  }

  const tenant = await resolveTenantByWellhubGymId(gymId);
  if (!tenant) {
    return { ok: false, status: 404, reason: "tenant_not_found" };
  }

  if (!tenant.config.wellhubWebhookSecret) {
    return { ok: false, status: 409, reason: "tenant_missing_secret" };
  }

  let secret: string;
  try {
    secret = decrypt(tenant.config.wellhubWebhookSecret);
  } catch {
    return { ok: false, status: 409, reason: "tenant_missing_secret" };
  }

  if (!verifySignature(rawBody, signatureHeader, secret)) {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }

  return { ok: true, event: parsed as E, tenantId: tenant.tenantId, gymId };
}

/**
 * Validates the CMS-level `SYSTEM_INTEGRATION_REQUESTED` webhook. Uses the
 * single secret in `WELLHUB_SYSTEM_NOTIFICATION_SECRET` instead of a per-gym
 * config (the secret is set when we register the notification webhook).
 */
export async function verifyAndParseSystemNotificationWebhook(
  request: NextRequest,
): Promise<
  | { ok: true; event: WellhubSystemIntegrationRequestedEvent }
  | WellhubWebhookFailure
> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get(HEADER);

  if (!signatureHeader) {
    return { ok: false, status: 401, reason: "missing_signature" };
  }

  const secret = process.env.WELLHUB_SYSTEM_NOTIFICATION_SECRET;
  if (!secret) {
    return { ok: false, status: 409, reason: "tenant_missing_secret" };
  }

  if (!verifySignature(rawBody, signatureHeader, secret)) {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }

  let parsed: WellhubSystemIntegrationRequestedEvent;
  try {
    parsed = JSON.parse(rawBody) as WellhubSystemIntegrationRequestedEvent;
  } catch {
    return { ok: false, status: 400, reason: "invalid_json" };
  }

  return { ok: true, event: parsed };
}
