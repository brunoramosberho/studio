import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { id } = await params;

    const spots = await prisma.blockedSpot.findMany({
      where: { classId: id, tenantId: ctx.tenant.id },
      include: { blockedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(spots);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    return NextResponse.json({ error: "Failed to fetch blocked spots" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { id } = await params;
    const { spotNumber, blockingNotes } = await request.json();

    const classData = await prisma.class.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      include: { room: true },
    });
    if (!classData) {
      return NextResponse.json({ error: "Clase no encontrada" }, { status: 404 });
    }

    if (spotNumber != null) {
      if (spotNumber < 1 || spotNumber > classData.room.maxCapacity) {
        return NextResponse.json({ error: "Número de lugar inválido" }, { status: 400 });
      }

      const existingBooking = await prisma.booking.findFirst({
        where: { classId: id, spotNumber, status: "CONFIRMED" },
      });
      if (existingBooking) {
        return NextResponse.json(
          { error: "Ese lugar ya tiene una reserva. Cancela la reserva primero." },
          { status: 409 },
        );
      }

      const alreadyBlocked = await prisma.blockedSpot.findFirst({
        where: { classId: id, spotNumber },
      });
      if (alreadyBlocked) {
        return NextResponse.json({ error: "Ese lugar ya está bloqueado" }, { status: 409 });
      }
    }

    const [blocked] = await prisma.$transaction([
      prisma.blockedSpot.create({
        data: {
          classId: id,
          spotNumber: spotNumber ?? null,
          blockedById: ctx.session.user.id,
          tenantId: ctx.tenant.id,
        },
      }),
      ...(blockingNotes !== undefined
        ? [prisma.class.update({ where: { id }, data: { blockingNotes } })]
        : []),
    ]);

    return NextResponse.json(blocked, { status: 201 });
  } catch (error: any) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "Ese lugar ya está bloqueado" }, { status: 409 });
    }
    console.error("POST blocked-spots error:", error);
    return NextResponse.json({ error: "Failed to block spot" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { id } = await params;
    const { spotNumber, blockedSpotId } = await request.json();

    if (blockedSpotId) {
      await prisma.blockedSpot.deleteMany({
        where: { id: blockedSpotId, classId: id, tenantId: ctx.tenant.id },
      });
    } else if (spotNumber != null) {
      await prisma.blockedSpot.deleteMany({
        where: { classId: id, spotNumber, tenantId: ctx.tenant.id },
      });
    } else {
      return NextResponse.json({ error: "spotNumber or blockedSpotId required" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("DELETE blocked-spots error:", error);
    return NextResponse.json({ error: "Failed to unblock spot" }, { status: 500 });
  }
}
