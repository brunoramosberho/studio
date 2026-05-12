import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant, session } = await requireRole("ADMIN", "FRONT_DESK", "COACH");
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

    // For Wellhub bookings we drive the Access Control validate call as part
    // of the check-in. The Magic-side update happens after Wellhub confirms.
    if (booking.platform === "wellhub") {
      const config = await prisma.studioPlatformConfig.findFirst({
        where: { tenantId: tenant.id, platform: "wellhub" },
        select: { wellhubGymId: true, wellhubMode: true, portalUrl: true },
      });

      if (config?.wellhubMode === "api" && config.wellhubGymId && booking.wellhubUserUniqueToken) {
        try {
          const { validateWellhubCheckin, WellhubApiError } = await import("@/lib/platforms/wellhub");
          await validateWellhubCheckin({
            gymId: config.wellhubGymId,
            wellhubId: booking.wellhubUserUniqueToken,
          });
        } catch (error) {
          const isApi = error && typeof error === "object" && "status" in error;
          const apiErr = isApi ? (error as { status: number; body: unknown }) : null;
          if (apiErr && apiErr.status === 404) {
            return NextResponse.json(
              { error: "wellhub_checkin_pending", message: "El miembro aún no ha hecho check-in en la app de Wellhub" },
              { status: 409 },
            );
          }
          console.error("Wellhub validate from platform check-in failed:", error);
          return NextResponse.json(
            { error: "wellhub_validate_failed" },
            { status: 502 },
          );
        }
      }

      const updated = await prisma.platformBooking.update({
        where: { id },
        data: { status: "checked_in", checkedInAt: new Date(), checkedInBy: session.user.id },
      });
      return NextResponse.json({
        booking: updated,
        reminder: null,
        portalUrl: config?.portalUrl ?? null,
      });
    }

    // ClassPass (and any future email-driven platform): keep the legacy flow.
    const updated = await prisma.platformBooking.update({
      where: { id },
      data: { status: "checked_in", checkedInAt: new Date(), checkedInBy: session.user.id },
    });

    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId: tenant.id, platform: booking.platform, isActive: true },
      select: { portalUrl: true },
    });

    return NextResponse.json({
      booking: updated,
      reminder: `Recuerda marcar la asistencia en el portal de ClassPass`,
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
