// Wellhub Integration Setup API — system-integration-requested webhook.
//
// Fired when a gym partners with Wellhub and selects Magic as its system.
// This is a PARTNER-LEVEL event (the gym has no tenant/config here yet), so it
// can't be verified against a per-tenant secret like the per-gym webhooks:
// the signature is checked against WELLHUB_SETUP_WEBHOOK_SECRET — the secret
// we hand Wellhub when registering this notification URL. If the env var is
// unset (bootstrap), events are accepted with a loud log so initial setup
// isn't a chicken-and-egg problem.
//
// We store the request (idempotent on gym_id — Wellhub retries deliveries) and
// notify the super-admins, who map the gym to a tenant/studio from the setup
// UI. Wellhub configures the per-gym event webhooks itself (our URLs are
// static), so no further API calls are required to complete onboarding.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySignature, SIGNATURE_HEADER } from "@/lib/platforms/wellhub/webhooks";
import { notifySuperAdmins } from "@/lib/super-admin-notify";

interface SetupEvent {
  event_type?: string;
  event_data?: {
    gym_id?: number;
    gym_name?: string;
    partner_id?: string;
    custom_fields?: { key?: string; value?: string }[];
    event_id?: string;
    timestamp?: number;
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const secret = process.env.WELLHUB_SETUP_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get(SIGNATURE_HEADER);
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  } else {
    console.warn(
      "[wellhub-setup] WELLHUB_SETUP_WEBHOOK_SECRET not set — accepting unsigned system-integration-requested event",
    );
  }

  let event: SetupEvent;
  try {
    event = JSON.parse(rawBody) as SetupEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const data = event.event_data;
  if (!data?.gym_id || !data.gym_name) {
    return NextResponse.json({ error: "missing_gym" }, { status: 400 });
  }

  try {
    // Idempotent on gym_id — a redelivery refreshes the data, never duplicates.
    const existing = await prisma.wellhubOnboardRequest.findUnique({
      where: { wellhubGymId: data.gym_id },
      select: { id: true, status: true },
    });
    await prisma.wellhubOnboardRequest.upsert({
      where: { wellhubGymId: data.gym_id },
      create: {
        wellhubGymId: data.gym_id,
        gymName: data.gym_name,
        partnerId: data.partner_id ?? null,
        customFields: data.custom_fields ?? undefined,
      },
      update: {
        gymName: data.gym_name,
        partnerId: data.partner_id ?? null,
        customFields: data.custom_fields ?? undefined,
      },
    });

    // Notify only on first sight (or if it came back after being dismissed) —
    // webhook retries must not spam the super-admins.
    if (!existing || existing.status === "dismissed") {
      const fields = (data.custom_fields ?? [])
        .filter((f) => f.key)
        .map((f) => `${f.key}: ${f.value ?? ""}`);
      await notifySuperAdmins({
        title: `Nuevo gym de Wellhub quiere integrarse — ${data.gym_name}`,
        body: `${data.gym_name} eligió Magic como su sistema en Wellhub. Mapea el gym a un tenant/ubicación para activarlo; Wellhub configura los webhooks automáticamente.`,
        details: [
          `gym_id: ${data.gym_id}`,
          `gym_name: ${data.gym_name}`,
          ...(data.partner_id ? [`partner_id: ${data.partner_id}`] : []),
          ...fields,
        ],
        tag: `wellhub-onboard-${data.gym_id}`,
      });
      if (existing?.status === "dismissed") {
        await prisma.wellhubOnboardRequest.update({
          where: { wellhubGymId: data.gym_id },
          data: { status: "pending" },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // 5xx so Wellhub redelivers; the upsert makes retries safe.
    console.error("[wellhub-setup] system-integration-requested failed", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
