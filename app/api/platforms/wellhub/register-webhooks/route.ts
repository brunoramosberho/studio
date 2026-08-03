// Self-service webhook registration: subscribe (or repair) the five Magic
// events for one of the tenant's gyms via the Integration Setup API — no
// account-manager round-trip. The gym must already be mapped to this tenant
// (tenant-level gym id or one of its studios).
//
// Secret precedence mirrors verification: the studio's own secret → the
// tenant secret → generate a fresh one (stored on the tenant config) if none
// exists yet. Registration and verification therefore always agree.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { requireRole } from "@/lib/tenant";
import { getWellhubTokenForTenant } from "@/lib/platforms/wellhub/client";
import {
  registerGymWebhooks,
  magicWebhookSet,
} from "@/lib/platforms/wellhub/integration-setup";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;
    const { gymId } = (await request.json()) as { gymId?: number };
    if (!gymId) return NextResponse.json({ error: "gymId requerido" }, { status: 400 });

    // The gym must belong to this tenant.
    const [config, studio] = await Promise.all([
      prisma.studioPlatformConfig.findFirst({
        where: { tenantId, platform: "wellhub" },
        select: { id: true, wellhubGymId: true, wellhubWebhookSecret: true },
      }),
      prisma.studio.findFirst({
        where: { tenantId, wellhubGymId: gymId },
        select: { id: true, wellhubWebhookSecret: true },
      }),
    ]);
    const isMine = config?.wellhubGymId === gymId || !!studio;
    if (!isMine) {
      return NextResponse.json(
        { error: "Ese gym no está mapeado a este estudio. Asigna el gym_id primero." },
        { status: 422 },
      );
    }

    // Pick the signing secret (most specific first); create one if none exists.
    let secret: string | null = null;
    for (const encrypted of [studio?.wellhubWebhookSecret, config?.wellhubWebhookSecret]) {
      if (!encrypted) continue;
      try {
        secret = decrypt(encrypted);
        break;
      } catch {
        /* try next */
      }
    }
    if (!secret) {
      secret = crypto.randomBytes(32).toString("base64url");
      if (config) {
        await prisma.studioPlatformConfig.update({
          where: { id: config.id },
          data: { wellhubWebhookSecret: encrypt(secret) },
        });
      } else {
        return NextResponse.json({ error: "Configura Wellhub primero" }, { status: 422 });
      }
    }

    const token = await getWellhubTokenForTenant(tenantId);
    await registerGymWebhooks(gymId, magicWebhookSet(secret), token);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/platforms/wellhub/register-webhooks error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message.slice(0, 200) : "Failed to register webhooks" },
      { status: 500 },
    );
  }
}
