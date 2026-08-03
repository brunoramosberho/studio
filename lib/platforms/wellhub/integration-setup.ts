// Wellhub Integration Setup API — the CMS-level API for managing gyms that
// selected Mgic as their system. Lives on its own host (partners-integrations)
// and, verified live 2026-08-03, works with the same bearer token as the
// Booking API (the token is CMS-scoped: one token operates every linked gym).
//
// This is what makes self-service onboarding possible: list the gyms linked
// to us, inspect the webhooks Wellhub has registered per gym, and register or
// repair them ourselves — no back-and-forth with the Wellhub account manager.

import { WellhubApiError } from "./errors";

const INTEGRATION_SETUP_BASE_URL = "https://api.partners-integrations.gympass.com";

export interface LinkedGym {
  id: number;
  enabled: boolean;
}

export interface GymWebhook {
  event: string;
  url: string;
  secret: string;
  additional_data?: boolean | null;
  internal_product?: boolean | null;
}

async function setupFetch<T>(
  path: string,
  token: string,
  init?: { method?: "GET" | "POST" | "PUT"; body?: unknown },
): Promise<T> {
  const res = await fetch(`${INTEGRATION_SETUP_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new WellhubApiError(res.status, text, `Integration Setup API ${path}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** GET /v1/systems/gyms — every gym that selected Mgic as its system. */
export async function listSystemGyms(token: string): Promise<LinkedGym[]> {
  const res = await setupFetch<{ gyms?: LinkedGym[]; partners?: LinkedGym[] }>(
    "/v1/systems/gyms",
    token,
  );
  // Docs say "partners", the live API says "gyms" — accept both.
  return res.gyms ?? res.partners ?? [];
}

/** GET /v1/systems/gyms/:id/webhooks — webhooks Wellhub has registered for the gym. */
export async function listGymWebhooks(gymId: number, token: string): Promise<GymWebhook[]> {
  const res = await setupFetch<{ webhooks?: GymWebhook[] }>(
    `/v1/systems/gyms/${gymId}/webhooks`,
    token,
  );
  return res.webhooks ?? [];
}

/** POST /v1/systems/gyms/:id/webhooks — subscribe the gym's webhooks (204). */
export async function registerGymWebhooks(
  gymId: number,
  webhooks: GymWebhook[],
  token: string,
): Promise<void> {
  await setupFetch<void>(`/v1/systems/gyms/${gymId}/webhooks`, token, {
    method: "POST",
    body: { webhooks },
  });
}

/** The five events Magic consumes, with our static endpoint for each. */
export function magicWebhookSet(secret: string): GymWebhook[] {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "mgic.app";
  // www host — the apex 307-redirects to www; registering the final host
  // spares every delivery a redirect hop.
  const base = `https://www.${root}/api/webhooks/wellhub`;
  return [
    { event: "booking-requested", url: `${base}/booking-requested`, secret },
    { event: "booking-canceled", url: `${base}/booking-canceled`, secret },
    { event: "booking-late-canceled", url: `${base}/booking-late-canceled`, secret },
    { event: "checkin-booking-occurred", url: `${base}/checkin-booking-occurred`, secret },
    // additional_data → user profile (name/email/phone) for the member roster;
    // internal_product → product id used by walk-in class matching.
    {
      event: "checkin",
      url: `${base}/checkin`,
      secret,
      additional_data: true,
      internal_product: true,
    },
  ];
}
