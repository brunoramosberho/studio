// Generates (or rotates) the per-tenant webhook signing secret used by
// Wellhub to sign inbound webhooks with HMAC-SHA1.
//
// In the direct-partner integration model, Wellhub registers the webhook URL
// + secret on their side manually (typically via the partner's account
// manager). This endpoint:
//   1. Generates a fresh random secret (32 bytes, base64url-encoded).
//   2. Stores it encrypted on StudioPlatformConfig.wellhubWebhookSecret.
//   3. Returns the PLAINTEXT secret ONCE so the admin can copy it and pass
//      it to their Wellhub contact. Subsequent reads only return a flag.

import crypto from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { requireRole } from "@/lib/tenant";

export async function POST() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const config = await prisma.studioPlatformConfig.findUnique({
      where: { tenantId_platform: { tenantId: tenant.id, platform: "wellhub" } },
      select: { id: true },
    });
    if (!config) {
      return NextResponse.json(
        { ok: false, reason: "config_missing", message: "Configure el gym_id antes de generar el secret." },
        { status: 400 },
      );
    }

    const secret = crypto.randomBytes(32).toString("base64url");
    await prisma.studioPlatformConfig.update({
      where: { id: config.id },
      data: { wellhubWebhookSecret: encrypt(secret) },
    });

    return NextResponse.json({ ok: true, secret });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/wellhub/rotate-secret error:", error);
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
