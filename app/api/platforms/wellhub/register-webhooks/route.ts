// Generates a fresh per-gym webhook secret, encrypts it in
// StudioPlatformConfig.wellhubWebhookSecret, and subscribes all five gym-level
// webhooks via the Integration Setup API.
//
// Re-running this rotates the secret. After rotation Wellhub will sign new
// webhooks with the new secret; old payloads in-flight will fail signature
// verification, which is acceptable because Wellhub retries 3x.

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { requireRole } from "@/lib/tenant";
import {
  WellhubApiError,
  subscribeGymWebhooks,
  type WellhubSetupWebhookSubscription,
} from "@/lib/platforms/wellhub";

const EVENTS: WellhubSetupWebhookSubscription["event"][] = [
  "booking-requested",
  "booking-canceled",
  "booking-late-canceled",
  "checkin-booking-occurred",
  "checkin",
];

function webhookBaseUrl(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = root.startsWith("localhost") ? "http" : "https";
  // Webhooks live at the apex (no tenant subdomain) because Wellhub resolves
  // the tenant from `gym_id` in the payload.
  return `${proto}://${root}`;
}

export async function POST() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      select: { wellhubGymId: true },
    });
    if (!config?.wellhubGymId) {
      return NextResponse.json(
        { ok: false, reason: "missing_gym_id" },
        { status: 400 },
      );
    }

    // 32 random bytes → 43 chars base64url (well under Wellhub's 100-char cap).
    const secret = randomBytes(32).toString("base64url");
    const baseUrl = webhookBaseUrl();

    const subscriptions: WellhubSetupWebhookSubscription[] = EVENTS.map((event) => ({
      event,
      url: `${baseUrl}/api/webhooks/wellhub/${event}`,
      secret,
    }));

    try {
      await subscribeGymWebhooks(config.wellhubGymId, subscriptions);
    } catch (error) {
      if (error instanceof WellhubApiError) {
        return NextResponse.json({
          ok: false,
          reason: "wellhub_rejected",
          status: error.status,
          body: error.body,
        }, { status: 502 });
      }
      throw error;
    }

    await prisma.studioPlatformConfig.update({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      data: {
        wellhubWebhookSecret: encrypt(secret),
        wellhubWebhooksRegistered: true,
      },
    });

    return NextResponse.json({
      ok: true,
      subscribed: EVENTS.length,
      events: EVENTS,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/wellhub/register-webhooks error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
