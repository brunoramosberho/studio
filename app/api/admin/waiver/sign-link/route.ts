import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getTenantBaseUrl } from "@/lib/email";
import { createWaiverToken } from "@/lib/waiver/token";

/**
 * A signing URL for a member, so staff can hand them the studio's iPad and
 * have them sign right there instead of waiting for the email to arrive.
 *
 * It's the same tokenized page the email link opens — same capture, same
 * legal record, signed by the member themselves. The token is short-lived
 * (a day) because unlike the emailed one it's meant to be used immediately;
 * a bearer link that lingers on a shared device is a liability.
 */
export async function POST(request: NextRequest) {
  try {
    // Operational work at the desk — front desk holds the checkIn permission.
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { memberId } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: memberId, tenantId: ctx.tenant.id } },
      select: { userId: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
    }

    const token = await createWaiverToken({
      userId: memberId,
      tenantId: ctx.tenant.id,
      expiresInDays: 1,
    });

    return NextResponse.json({
      url: `${getTenantBaseUrl(ctx.tenant.slug)}/waiver/sign?token=${token}`,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/admin/waiver/sign-link error:", error);
    return NextResponse.json({ error: "Error al generar el enlace" }, { status: 500 });
  }
}
