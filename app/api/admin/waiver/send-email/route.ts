import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { sendWaiverReminder, getTenantBaseUrl } from "@/lib/email";
import { getServerBranding } from "@/lib/branding.server";
import { createWaiverToken } from "@/lib/waiver/token";

export async function POST(request: NextRequest) {
  try {
    // Sending a waiver link during check-in is operational work, so front desk
    // can do it too (they already hold the "checkIn" permission). The waiver
    // *configuration* section remains ADMIN-only.
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { memberId } = await request.json();

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { id: memberId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      return NextResponse.json({ error: "Miembro no encontrado o sin email" }, { status: 404 });
    }

    const branding = await getServerBranding();
    const baseUrl = getTenantBaseUrl(ctx.tenant.slug);
    const token = await createWaiverToken({ userId: memberId, tenantId: ctx.tenant.id });
    const signUrl = `${baseUrl}/waiver/sign?token=${token}`;

    await sendWaiverReminder({
      to: user.email,
      name: user.name ?? "",
      signUrl,
      branding,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/admin/waiver/send-email error:", error);
    return NextResponse.json({ error: "Error al enviar correo" }, { status: 500 });
  }
}
