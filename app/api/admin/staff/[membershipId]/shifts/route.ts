import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../../_auth";

// Admin can manually create a shift for a staff member — useful when they
// forgot to clock in, or when migrating from a previous system. Geofence is
// NOT enforced for manual entries; the admin owns the responsibility.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { membershipId } = await params;

    const m = await prisma.membership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenant.id },
      select: { id: true, userId: true },
    });
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const { studioId, clockInAt, clockOutAt, notes, reason } = body ?? {};
    if (!studioId || !clockInAt || !clockOutAt) {
      return NextResponse.json(
        { error: "studioId, clockInAt y clockOutAt son requeridos" },
        { status: 400 },
      );
    }
    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return NextResponse.json(
        { error: "Debes indicar una razón para crear el turno manualmente" },
        { status: 400 },
      );
    }

    const studio = await prisma.studio.findFirst({
      where: { id: studioId, tenantId: ctx.tenant.id },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!studio) return NextResponse.json({ error: "Estudio inválido" }, { status: 400 });

    const inAt = new Date(clockInAt);
    const outAt = new Date(clockOutAt);
    if (outAt <= inAt) {
      return NextResponse.json(
        { error: "El clock-out debe ser posterior al clock-in" },
        { status: 400 },
      );
    }

    const duration = Math.round((outAt.getTime() - inAt.getTime()) / 60_000);
    const adminId = ctx.session.user?.id ?? null;

    const shift = await prisma.staffShift.create({
      data: {
        tenantId: ctx.tenant.id,
        userId: m.userId,
        membershipId: m.id,
        studioId,
        clockInAt: inAt,
        // Use studio centroid as the recorded position for manual entries so
        // distance audits stay sane. Coordinates default to 0/0 only if the
        // studio has no lat/lng configured at all.
        clockInLat: studio.latitude ?? 0,
        clockInLng: studio.longitude ?? 0,
        clockInDistance: 0,
        clockOutAt: outAt,
        clockOutLat: studio.latitude,
        clockOutLng: studio.longitude,
        clockOutDistance: 0,
        durationMinutes: duration,
        status: "EDITED",
        notes: notes || null,
        editedById: adminId,
        editReason: reason,
        editedAt: new Date(),
      },
      include: { studio: { select: { id: true, name: true } } },
    });

    return NextResponse.json(shift, { status: 201 });
  } catch (error) {
    console.error("POST manual shift error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
