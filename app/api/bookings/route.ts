import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendBookingConfirmation } from "@/lib/email";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const now = new Date();

    const isUpcoming = status === "upcoming";
    const isPast = status === "past";

    const bookings = await prisma.booking.findMany({
      where: {
        userId: session.user.id,
        ...(isUpcoming
          ? { status: "CONFIRMED", class: { startsAt: { gte: now } } }
          : isPast
            ? {
                OR: [
                  { status: { in: ["ATTENDED", "NO_SHOW", "CANCELLED"] } },
                  { class: { startsAt: { lt: now } } },
                ],
              }
            : {}),
      },
      include: {
        class: {
          include: {
            classType: true,
            coach: { include: { user: { select: { name: true, image: true } } } },
          },
        },
      },
      orderBy: { class: { startsAt: isUpcoming ? "asc" : "desc" } },
      take: 50,
    });

    return NextResponse.json(bookings);
  } catch (error) {
    console.error("GET /api/bookings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { classId, guestName, guestEmail, spotNumber, privacy } = body;

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
        room: { include: { studio: true } },
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

    const spotsLeft = classData.room.maxCapacity - classData._count.bookings;
    if (spotsLeft <= 0) {
      return NextResponse.json(
        { error: "Class is full. Consider joining the waitlist.", full: true },
        { status: 409 },
      );
    }

    if (spotNumber != null) {
      if (spotNumber < 1 || spotNumber > classData.room.maxCapacity) {
        return NextResponse.json(
          { error: "Número de lugar inválido" },
          { status: 400 },
        );
      }
      const spotTaken = await prisma.booking.findFirst({
        where: { classId, spotNumber, status: "CONFIRMED" },
      });
      if (spotTaken) {
        return NextResponse.json(
          { error: "Ese lugar ya está ocupado. Selecciona otro." },
          { status: 409 },
        );
      }
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
        spotNumber: spotNumber ?? null,
        privacy: privacy === "PRIVATE" ? "PRIVATE" : "PUBLIC",
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
        location: classData.room.studio.name ?? undefined,
      });
    }

    if (session?.user?.id && privacy !== "PRIVATE") {
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

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    console.error("POST /api/bookings error:", error);
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 },
    );
  }
}
