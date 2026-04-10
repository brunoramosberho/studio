import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAuth, requireTenant } from "@/lib/tenant";
import { sendBookingConfirmation, getTenantBaseUrl } from "@/lib/email";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { removeSpotNotifyMe } from "@/lib/waitlist";

export async function GET(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();

    const status = request.nextUrl.searchParams.get("status");
    const now = new Date();

    const isUpcoming = status === "upcoming";
    const isPast = status === "past";

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        userId: session.user.id,
        ...(isUpcoming
          ? { status: "CONFIRMED", class: { startsAt: { gte: now } } }
          : isPast
            ? {
                OR: [
                  { status: { in: ["ATTENDED", "NO_SHOW"] } },
                  { status: "CONFIRMED", class: { startsAt: { lt: now } } },
                  { status: "CANCELLED", creditLost: true },
                ],
              }
            : {}),
      },
      include: {
        class: {
          include: {
            classType: true,
            coach: { include: { user: { select: { name: true, image: true } } } },
            room: { include: { studio: { select: { name: true } } } },
          },
        },
      },
      orderBy: { class: { startsAt: isUpcoming ? "asc" : "desc" } },
      take: 50,
    });

    // Attach friends going to the same classes (only for upcoming)
    if (isUpcoming && bookings.length > 0) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
        },
        select: { requesterId: true, addresseeId: true },
      });
      const friendIds = friendships.map((f) =>
        f.requesterId === session.user.id ? f.addresseeId : f.requesterId,
      );

      if (friendIds.length > 0) {
        const classIds = bookings.map((b) => b.classId);
        const friendBookings = await prisma.booking.findMany({
          where: {
            tenantId: tenant.id,
            classId: { in: classIds },
            userId: { in: friendIds },
            status: "CONFIRMED",
          },
          select: {
            classId: true,
            user: { select: { id: true, name: true, image: true } },
          },
        });

        const friendsByClass = new Map<string, { id: string; name: string | null; image: string | null }[]>();
        for (const fb of friendBookings) {
          if (!fb.user) continue;
          const arr = friendsByClass.get(fb.classId) ?? [];
          arr.push(fb.user);
          friendsByClass.set(fb.classId, arr);
        }

        const enriched = bookings.map((b) => ({
          ...b,
          friendsGoing: friendsByClass.get(b.classId) ?? [],
        }));
        return NextResponse.json(enriched);
      }
    }

    return NextResponse.json(bookings.map((b) => ({ ...b, friendsGoing: [] })));
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
    const tenant = await requireTenant();
    const body = await request.json();
    const { classId, packageId, guestName, guestEmail, spotNumber, privacy } = body;

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
      where: { id: classId, tenantId: tenant.id },
      include: {
        classType: true,
        room: { include: { studio: { include: { city: { select: { timezone: true } } } } } },
        coach: { include: { user: { select: { name: true, image: true } } } },
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

    const blockedCount = await prisma.blockedSpot.count({ where: { classId } });
    const spotsLeft = classData.room.maxCapacity - classData._count.bookings - blockedCount;
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

      const spotBlocked = await prisma.blockedSpot.findFirst({
        where: { classId, spotNumber },
      });
      if (spotBlocked) {
        return NextResponse.json(
          { error: "Ese lugar está bloqueado. Selecciona otro." },
          { status: 409 },
        );
      }

      const spotTaken = await prisma.booking.findFirst({
        where: { classId, tenantId: tenant.id, spotNumber, status: "CONFIRMED" },
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
          tenantId: tenant.id,
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
          tenantId: tenant.id,
          expiresAt: { gt: new Date() },
        },
        include: { package: { include: { classTypes: { select: { id: true } } } } },
        orderBy: { expiresAt: "asc" },
      });

      const classTypeId = classData.classTypeId;
      function packageCoversClass(p: (typeof userPackages)[number]) {
        if (!p.package.classTypes.length) return true;
        return p.package.classTypes.some((ct) => ct.id === classTypeId);
      }

      let userPackage = null;

      if (packageId) {
        userPackage = userPackages.find(
          (p) => p.id === packageId && (p.creditsTotal === null || p.creditsUsed < p.creditsTotal) && packageCoversClass(p),
        );
      }

      if (!userPackage) {
        userPackage = userPackages.find(
          (p) => (p.creditsTotal === null || p.creditsUsed < p.creditsTotal) && packageCoversClass(p),
        );
      }

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
        tenantId: tenant.id,
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

    if (session?.user?.id) {
      removeSpotNotifyMe(classId, session.user.id);
    }

    const recipientEmail = session?.user?.email ?? guestEmail;
    const recipientName = session?.user?.name ?? guestName;
    if (recipientEmail && recipientName) {
      const baseUrl = getTenantBaseUrl(tenant.slug);
      sendBookingConfirmation({
        to: recipientEmail,
        name: recipientName,
        className: classData.classType.name,
        coachName: classData.coach.name ?? "Coach",
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.room.studio.name ?? undefined,
        timezone: classData.room.studio.city?.timezone,
        classUrl: `${baseUrl}/class/${classId}`,
      });
    }

    if (session?.user?.id) {
      updateLifecycle(session.user.id, tenant.id, "booked").catch(
        (err) => console.error("Lifecycle update (booked) failed:", err),
      );
    }

    if (session?.user?.id && privacy !== "PRIVATE") {
      const existingEvent = await prisma.feedEvent.findFirst({
        where: {
          tenantId: tenant.id,
          userId: session.user.id,
          eventType: "CLASS_RESERVED",
          payload: { path: ["classId"], equals: classId },
        },
        select: { id: true },
      });

      if (!existingEvent) {
        prisma.feedEvent
          .create({
            data: {
              tenantId: tenant.id,
              userId: session.user.id,
              eventType: "CLASS_RESERVED",
              visibility: "FRIENDS_ONLY",
              payload: {
                classId,
                className: classData.classType.name,
                classTypeColor: classData.classType.color,
                classTypeIcon: classData.classType.icon,
                coachName: classData.coach.name,
                coachImage: classData.coach.photoUrl || classData.coach.user?.image,
                coachUserId: classData.coach.userId,
                date: classData.startsAt.toISOString(),
                duration: classData.classType.duration,
              },
            },
          })
          .catch(() => {});
      }
    }

    return NextResponse.json(booking, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/bookings error:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ese lugar ya está ocupado. Selecciona otro." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 },
    );
  }
}
