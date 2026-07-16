// Request access to the Wellhub payment-advance feature. Sets the tenant's
// advance config to `requested`; the super-admin grants it from admin.mgic.app.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST() {
  try {
    const ctx = await requireRole("ADMIN");

    const existing = await prisma.wellhubAdvanceConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
    });
    if (existing?.access === "enabled") {
      return NextResponse.json({ ok: true, access: "enabled" });
    }

    const config = await prisma.wellhubAdvanceConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: {
        tenantId: ctx.tenant.id,
        access: "requested",
        requestedAt: new Date(),
      },
      update: { access: "requested", requestedAt: new Date() },
    });

    // Tell the super-admins there's an access request to review.
    const { notifySuperAdminsOfAdvance } = await import("@/lib/platforms/wellhub/advance-notify");
    await notifySuperAdminsOfAdvance({
      kind: "access_request",
      tenantName: ctx.tenant.name,
      tenantSlug: ctx.tenant.slug,
    });

    return NextResponse.json({ ok: true, access: config.access });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/platforms/wellhub/advance/request-access error:", error);
    return NextResponse.json({ error: "Failed to request access" }, { status: 500 });
  }
}
