// Integration Setup API — used at the CMS (Magic) level to:
//   1. Discover which gyms have selected us as their CMS.
//   2. Programmatically subscribe webhooks per gym.
//   3. Register a top-level webhook so Wellhub can notify us of new partners
//      (`SYSTEM_INTEGRATION_REQUESTED`).
//
// All endpoints share the standard Bearer token. Base URL is distinct from
// Booking/Access Control: `api.partners-integrations.gympass.com`.

import { setupApi } from "./client";
import type {
  WellhubSetupGymsListResponse,
  WellhubSetupSystemNotificationSubscribeRequest,
  WellhubSetupWebhookListResponse,
  WellhubSetupWebhookSubscription,
} from "./types";

// ─── Gym discovery ────────────────────────────────────────────────────────

export async function listIntegratedGyms(): Promise<
  Array<{ id: number; enabled: boolean }>
> {
  const res = await setupApi<WellhubSetupGymsListResponse>("/v1/systems/gyms");
  return res.partners ?? [];
}

// ─── Per-gym webhook subscriptions ────────────────────────────────────────

export function subscribeGymWebhooks(
  gymId: number,
  webhooks: WellhubSetupWebhookSubscription[],
): Promise<void> {
  return setupApi<void>(`/v1/systems/gyms/${gymId}/webhooks`, {
    method: "POST",
    body: { webhooks },
  });
}

export function updateGymWebhook(
  gymId: number,
  event: WellhubSetupWebhookSubscription["event"],
  payload: WellhubSetupWebhookSubscription,
): Promise<void> {
  return setupApi<void>(`/v1/systems/gyms/${gymId}/webhooks/${event}`, {
    method: "PUT",
    body: { webhook: payload },
  });
}

export async function listGymWebhooks(
  gymId: number,
): Promise<WellhubSetupWebhookSubscription[]> {
  const res = await setupApi<WellhubSetupWebhookListResponse>(
    `/v1/systems/gyms/${gymId}/webhooks`,
  );
  return res.webhooks ?? [];
}

export function getGymWebhook(
  gymId: number,
  event: WellhubSetupWebhookSubscription["event"],
): Promise<{ webhook: WellhubSetupWebhookSubscription }> {
  return setupApi<{ webhook: WellhubSetupWebhookSubscription }>(
    `/v1/systems/gyms/${gymId}/webhooks/${event}`,
  );
}

// ─── CMS-level system-integration notification webhook ────────────────────

export function registerSystemNotificationWebhook(
  payload: WellhubSetupSystemNotificationSubscribeRequest,
): Promise<void> {
  return setupApi<void>("/v1/systems/gyms/notification-webhook", {
    method: "POST",
    body: payload,
  });
}
