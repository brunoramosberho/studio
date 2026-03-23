import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendBookingConfirmation } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { classId, guestName, guestEmail } = body;

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 },
      );
    }

    const session = await auth();
    const isGuest = !session?.user;

    if (isGuest && (!guestName || !guestEmail)) {
      return NextResponse.json(
        { error: "Guest bookings require guestName and guestEmail" },
        { status: 400 },
      );
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        classType: true,
        coach: { include: { user: { select: { name: true } } } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
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

    const spotsLeft = classData.classType.maxCapacity - classData._count.bookings;
    if (spotsLeft <= 0) {
      return NextResponse.json(
        { error: "Class is full. Consider joining the waitlist.", full: true },
        { status: 409 },
      );
    }

    if (session?.user) {
      const existingBooking = await prisma.booking.findFirst({
        where: {
          classId,
          userId: session.user.id,
          status: "CONFIRMED",
        },
      });
      if (existingBooking) {
        return NextResponse.json(
          { error: "You already have a booking for this class" },
          { status: 409 },
        );
      }
    }

    let packageUsedId: string | null = null;

    if (session?.user) {
      const userPackages = await prisma.userPackage.findMany({
        where: {
          userId: session.user.id,
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: "asc" },
      });

      const userPackage = userPackages.find(
        (p) => p.creditsTotal === null || p.creditsUsed < p.creditsTotal,
      );

      if (!userPackage) {
        return NextResponse.json(
          { error: "No valid package with available credits" },
          { status: 402 },
        );
      }

      await prisma.userPackage.update({
        where: { id: userPackage.id },
        data: { creditsUsed: { increment: 1 } },
      });

      packageUsedId = userPackage.id;
    }

    const booking = await prisma.booking.create({
      data: {
        classId,
        userId: session?.user?.id ?? null,
        guestName: isGuest ? guestName : null,
        guestEmail: isGuest ? guestEmail : null,
        status: "CONFIRMED",
        packageUsed: packageUsedId,
      },
      include: {
        class: {
          include: {
            classType: true,
            coach: { include: { user: { select: { name: true } } } },
          },
        },
      },
    });

    const recipientEmail = session?.user?.email ?? guestEmail;
    const recipientName = session?.user?.name ?? guestName;
    if (recipientEmail && recipientName) {
      sendBookingConfirmation({
        to: recipientEmail,
        name: recipientName,
        className: classData.classType.name,
        coachName: classData.coach.user.name ?? "Coach",
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.location ?? undefined,
      });
    }

    // Generate CLASS_RESERVED feed event (visible to friends only)
    if (session?.user?.id) {
      const privacy = body.privacy ?? "public";
      if (privacy !== "private") {
        prisma.feedEvent
          .create({
            data: {
              userId: session.user.id,
              eventType: "CLASS_RESERVED",
              visibility: "FRIENDS_ONLY",
              payload: {
                classId,
                className: classData.classType.name,
                coachName: classData.coach.user.name,
                date: classData.startsAt.toISOString(),
                duration: classData.classType.duration,
              },
            },
          })
          .catch(() => {});
      }
    }

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    console.error("POST /api/bookings error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 },
    );
  }
}
