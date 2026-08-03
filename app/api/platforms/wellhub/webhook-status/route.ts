// Live webhook health per gym, straight from Wellhub's Integration Setup API:
// which of the five Magic events are registered, whether the URL points at our
// endpoints, and whether the signing secret matches one we can validate. This
// replaces guessing ("¿ya configuró Ben los webhooks?") with ground truth.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { requireRole } from "@/lib/tenant";
import { getWellhubTokenForTenant } from "@/lib/platforms/wellhub/client";
import { listGymWebhooks } from "@/lib/platforms/wellhub/integration-setup";

const EXPECTED_EVENTS = [
  "booking-requested",
  "booking-canceled",
  "booking-late-canceled",
  "checkin-booking-occurred",
  "checkin",
];

// Nice-to-have, not required for a healthy integration. Betoro deliberately
// runs without checkin-booking-occurred (adding it would force Wellhub to
// reset the gym, cancelling live bookings) — the checkin webhook covers it.
const OPTIONAL_EVENTS = new Set(["checkin-booking-occurred"]);

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    // My gyms: the tenant-level one + every mapped studio.
    const [config, studios] = await Promise.all([
      prisma.studioPlatformConfig.findFirst({
        where: { tenantId, platform: "wellhub" },
        select: { wellhubGymId: true, wellhubWebhookSecret: true },
      }),
      prisma.studio.findMany({
        where: { tenantId, wellhubGymId: { not: null } },
        select: { name: true, wellhubGymId: true, wellhubWebhookSecret: true },
      }),
    ]);

    const myGyms: { gymId: number; label: string; encryptedSecret: string | null }[] = [];
    if (config?.wellhubGymId) {
      myGyms.push({
        gymId: config.wellhubGymId,
        label: "Principal",
        encryptedSecret: config.wellhubWebhookSecret,
      });
    }
    for (const s of studios) {
      if (myGyms.some((g) => g.gymId === s.wellhubGymId)) continue;
      myGyms.push({
        gymId: s.wellhubGymId!,
        label: s.name,
        encryptedSecret: s.wellhubWebhookSecret ?? config?.wellhubWebhookSecret ?? null,
      });
    }
    if (myGyms.length === 0) return NextResponse.json({ gyms: [] });

    const token = await getWellhubTokenForTenant(tenantId).catch(() => null);
    if (!token) return NextResponse.json({ gyms: [], reason: "no_token" });

    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "mgic.app";
    const ourHosts = [`https://${root}`, `https://www.${root}`];

    const gyms = await Promise.all(
      myGyms.map(async (g) => {
        // Secrets this gym's webhooks may legitimately be signed with.
        const validSecrets: string[] = [];
        if (g.encryptedSecret) {
          try {
            validSecrets.push(decrypt(g.encryptedSecret));
          } catch {
            /* skip undecryptable */
          }
        }
        if (process.env.WELLHUB_PLATFORM_WEBHOOK_SECRET) {
          validSecrets.push(process.env.WELLHUB_PLATFORM_WEBHOOK_SECRET);
        }

        try {
          const registered = await listGymWebhooks(g.gymId, token);
          const byEvent = new Map(registered.map((w) => [w.event, w]));
          const webhooks = EXPECTED_EVENTS.map((event) => {
            const w = byEvent.get(event);
            const optional = OPTIONAL_EVENTS.has(event);
            if (!w) return { event, optional, registered: false, urlOk: false, secretOk: false };
            return {
              event,
              optional,
              registered: true,
              urlOk: ourHosts.some((h) => w.url.startsWith(`${h}/api/webhooks/wellhub/`)),
              secretOk: validSecrets.includes(w.secret),
            };
          });
          // Health ignores missing optional events; a REGISTERED optional event
          // with a bad url/secret still counts as broken.
          const ok = webhooks.every(
            (w) =>
              (w.optional && !w.registered) || (w.registered && w.urlOk && w.secretOk),
          );
          return { gymId: g.gymId, label: g.label, ok, webhooks };
        } catch (err) {
          return {
            gymId: g.gymId,
            label: g.label,
            ok: false,
            webhooks: [],
            error: err instanceof Error ? err.message.slice(0, 200) : "unknown",
          };
        }
      }),
    );

    return NextResponse.json({ gyms });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/platforms/wellhub/webhook-status error:", error);
    return NextResponse.json({ error: "Failed to load webhook status" }, { status: 500 });
  }
}
