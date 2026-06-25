import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/**
 * Move a booking to a different (empty) spot within the same class, from the
 * check-in room map. Works for any booking in the class — members, guests, or
 * the seat-holding companion booking of a platform (Wellhub/ClassPass)
 * reservation. The target must be in range, not blocked, and not held by
 * another active booking.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { classId } = await params;
    const { bookingId, spotNumber } = await request.json();

    if (typeof bookingId !== "string" || typeof spotNumber !== "number") {
      return NextResponse.json(
        { error: "bookingId and spotNumber are required" },
        { status: 400 },
      );
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      include: { room: { select: { maxCapacity: true } } },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const target = Math.floor(spotNumber);
    if (target < 1 || target > cls.room.maxCapacity) {
      return NextResponse.json({ error: "Lugar fuera de rango" }, { status: 400 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, classId, tenantId: ctx.tenant.id },
      select: { id: true, spotNumber: true },
    });
    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }
    if (booking.spotNumber === target) {
      return NextResponse.json({ ok: true, spotNumber: target });
    }

    const blocked = await prisma.blockedSpot.findFirst({
      where: { classId, spotNumber: target },
    });
    if (blocked) {
      return NextResponse.json({ error: "Ese lugar está bloqueado" }, { status: 409 });
    }

    // Any non-cancelled booking holding the target physically occupies it
    // (cancelled bookings always clear their spotNumber, so they don't count).
    const occupied = await prisma.booking.findFirst({
      where: {
        classId,
        tenantId: ctx.tenant.id,
        spotNumber: target,
        status: { in: ["CONFIRMED", "ATTENDED", "NO_SHOW"] },
        id: { not: bookingId },
      },
      select: { id: true },
    });
    if (occupied) {
      return NextResponse.json({ error: "Ese lugar ya está ocupado" }, { status: 409 });
    }

    try {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { spotNumber: target },
      });
    } catch (e) {
      // Lost a race to the unique [classId, spotNumber] constraint.
      if ((e as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: "Ese lugar ya está ocupado" }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ ok: true, spotNumber: target });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("PATCH /api/check-in/[classId]/spot error:", error);
    return NextResponse.json({ error: "Failed to move spot" }, { status: 500 });
  }
}
