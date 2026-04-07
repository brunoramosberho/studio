import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant, session } = await requireRole("ADMIN");
    const { id } = await params;

    const booking = await prisma.platformBooking.findFirst({
      where: { id, tenantId: tenant.id },
      include: { class: true },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.status === "checked_in") {
      return NextResponse.json({ error: "Already checked in" }, { status: 409 });
    }

    const updated = await prisma.platformBooking.update({
      where: { id },
      data: {
        status: "checked_in",
        checkedInAt: new Date(),
        checkedInBy: session.user.id,
      },
    });

    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId: tenant.id, platform: booking.platform, isActive: true },
      select: { portalUrl: true },
    });

    const platformLabel = booking.platform === "classpass" ? "ClassPass" : "Gympass";

    return NextResponse.json({
      booking: updated,
      reminder: `Recuerda marcar la asistencia en el portal de ${platformLabel}`,
      portalUrl: config?.portalUrl ?? null,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/bookings/[id]/checkin error:", error);
    return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
  }
}
