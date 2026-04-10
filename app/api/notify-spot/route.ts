import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();

    const body = await request.json();
    const { classId } = body;

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 },
      );
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId, tenantId: tenant.id },
      include: {
        room: { select: { maxCapacity: true } },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            blockedSpots: true,
          },
        },
      },
    });

    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    if (classData.status === "CANCELLED") {
      return NextResponse.json(
        { error: "This class has been cancelled" },
        { status: 400 },
      );
    }

    const spotsLeft =
      classData.room.maxCapacity -
      classData._count.bookings -
      classData._count.blockedSpots;

    if (spotsLeft > 0) {
      return NextResponse.json(
        { error: "Class still has spots available. Book directly instead." },
        { status: 400 },
      );
    }

    const existingBooking = await prisma.booking.findFirst({
      where: {
        tenantId: tenant.id,
        classId,
        userId: session.user.id,
        status: { in: ["CONFIRMED", "ATTENDED"] },
      },
    });
    if (existingBooking) {
      return NextResponse.json(
        { error: "You already have a booking for this class" },
        { status: 409 },
      );
    }

    const existingWaitlist = await prisma.waitlist.findFirst({
      where: { classId, tenantId: tenant.id, userId: session.user.id },
    });
    if (existingWaitlist) {
      return NextResponse.json(
        { error: "You are already on the waitlist for this class" },
        { status: 409 },
      );
    }

    const existing = await prisma.classNotifyMe.findUnique({
      where: { classId_userId: { classId, userId: session.user.id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Ya tienes la notificación activada para esta clase" },
        { status: 409 },
      );
    }

    const entry = await prisma.classNotifyMe.create({
      data: {
        tenantId: tenant.id,
        classId,
        userId: session.user.id,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/notify-spot error:", error);
    return NextResponse.json(
      { error: "Failed to subscribe to spot notifications" },
      { status: 500 },
    );
  }
}
