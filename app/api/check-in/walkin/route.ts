import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const { classId, memberId, force } = await request.json();

    if (!classId || !memberId) {
      return NextResponse.json({ error: "classId and memberId are required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      include: {
        room: { select: { maxCapacity: true } },
        _count: {
          select: { bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } } },
        },
      },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const existingBooking = await prisma.booking.findFirst({
      where: { classId, userId: memberId, status: { in: ["CONFIRMED", "ATTENDED"] } },
    });
    if (existingBooking) {
      return NextResponse.json({ error: "Member already enrolled" }, { status: 409 });
    }

    const isFull = cls._count.bookings >= cls.room.maxCapacity;
    if (isFull && !force) {
      return NextResponse.json(
        { error: "Class is full", requiresConfirmation: true },
        { status: 409 },
      );
    }

    const booking = await prisma.booking.create({
      data: {
        classId,
        userId: memberId,
        tenantId: ctx.tenant.id,
        status: "CONFIRMED",
      },
    });

    const now = new Date();
    const checkIn = await prisma.checkIn.create({
      data: {
        tenantId: ctx.tenant.id,
        classId,
        memberId,
        checkedInBy: ctx.session.user.id,
        method: "manual",
        status: now > cls.startsAt ? "late" : "present",
      },
    });

    return NextResponse.json({ booking, checkIn }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/check-in/walkin error:", error);
    return NextResponse.json({ error: "Failed to add walk-in" }, { status: 500 });
  }
}
