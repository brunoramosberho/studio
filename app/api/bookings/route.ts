import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAuth, requireTenant } from "@/lib/tenant";
import { sendBookingConfirmation, getTenantBaseUrl } from "@/lib/email";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { removeSpotNotifyMe } from "@/lib/waitlist";
import { findPackageForClass, deductCredit, userPackageIncludeForBooking } from "@/lib/credits";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";

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
                  { status: "CANCELLED", class: { startsAt: { lt: now } } },
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
    const guests: { name: string; email: string; spotNumber?: number }[] = body.guests ?? [];

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

    // Validate guest entries
    for (const g of guests) {
      if (!g.name?.trim() || !g.email?.trim()) {
        return NextResponse.json(
          { error: "Cada invitado requiere nombre completo y correo electrónico" },
          { status: 400 },
        );
      }
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
    const totalPeople = 1 + guests.length;
    const spotsLeft = classData.room.maxCapacity - classData._count.bookings - blockedCount;
    if (spotsLeft < totalPeople) {
      if (spotsLeft <= 0) {
        return NextResponse.json(
          { error: "Class is full. Consider joining the waitlist.", full: true },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: `No hay suficientes lugares. Solo quedan ${spotsLeft} lugar(es) disponible(s).` },
        { status: 409 },
      );
    }

    // Validate all spot numbers (self + guests)
    const allSpots: number[] = [];
    if (spotNumber != null) allSpots.push(spotNumber);
    for (const g of guests) {
      if (g.spotNumber != null) allSpots.push(g.spotNumber);
    }

    for (const sn of allSpots) {
      if (sn < 1 || sn > classData.room.maxCapacity) {
        return NextResponse.json(
          { error: "Número de lugar inválido" },
          { status: 400 },
        );
      }
    }

    // Check for duplicate spot selections
    const uniqueSpots = new Set(allSpots);
    if (uniqueSpots.size !== allSpots.length) {
      return NextResponse.json(
        { error: "No puedes seleccionar el mismo lugar para más de una persona" },
        { status: 400 },
      );
    }

    // Check all spots are available
    for (const sn of allSpots) {
      const spotBlocked = await prisma.blockedSpot.findFirst({
        where: { classId, spotNumber: sn },
      });
      if (spotBlocked) {
        return NextResponse.json(
          { error: `El lugar ${sn} está bloqueado. Selecciona otro.` },
          { status: 409 },
        );
      }

      const spotTaken = await prisma.booking.findFirst({
        where: { classId, tenantId: tenant.id, spotNumber: sn, status: "CONFIRMED" },
      });
      if (spotTaken) {
        return NextResponse.json(
          { error: `El lugar ${sn} ya está ocupado. Selecciona otro.` },
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
        include: {
          ...userPackageIncludeForBooking,
          package: {
            include: {
              classTypes: { select: { id: true } },
              creditAllocations: { select: { classTypeId: true } },
            },
          },
        },
        orderBy: { expiresAt: "asc" },
      });

      const classTypeId = classData.classTypeId;
      const userPackage = findPackageForClass(userPackages, classTypeId, packageId);

      if (!userPackage) {
        return NextResponse.json(
          { error: "No valid package with available credits" },
          { status: 402 },
        );
      }

      // Validate guests are allowed for this package
      if (guests.length > 0) {
        const pkg = userPackage.package as any;

        if (!pkg.allowGuests) {
          return NextResponse.json(
            { error: "Tu paquete no permite agregar invitados" },
            { status: 403 },
          );
        }

        if (pkg.maxGuestsPerBooking != null && guests.length > pkg.maxGuestsPerBooking) {
          return NextResponse.json(
            { error: `Máximo ${pkg.maxGuestsPerBooking} invitado(s) por reserva` },
            { status: 400 },
          );
        }

        // For unlimited packages, check monthly guest pass limit
        if (pkg.credits === null && pkg.monthlyGuestPasses != null) {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const guestBookingsThisMonth = await prisma.booking.count({
            where: {
              tenantId: tenant.id,
              parentBookingId: { not: null },
              status: { in: ["CONFIRMED", "ATTENDED"] },
              createdAt: { gte: monthStart },
              parentBooking: { userId: session.user.id },
            },
          });

          if (guestBookingsThisMonth + guests.length > pkg.monthlyGuestPasses) {
            const remaining = Math.max(0, pkg.monthlyGuestPasses - guestBookingsThisMonth);
            return NextResponse.json(
              { error: `Te quedan ${remaining} pase(s) de invitado este mes. Intentas agregar ${guests.length}.` },
              { status: 400 },
            );
          }
        }
      }

      // Check enough credits for self + all guests
      const creditsNeeded = totalPeople;
      const hasAllocations = userPackage.creditUsages.length > 0;
      if (hasAllocations) {
        const usage = userPackage.creditUsages.find((u) => u.classTypeId === classTypeId);
        const available = usage ? usage.creditsTotal - usage.creditsUsed : 0;
        if (available < creditsNeeded) {
          return NextResponse.json(
            { error: `Necesitas ${creditsNeeded} crédito(s) (tú + ${guests.length} invitado(s)), pero solo tienes ${available}.` },
            { status: 402 },
          );
        }
      } else if (userPackage.creditsTotal !== null) {
        const available = userPackage.creditsTotal - userPackage.creditsUsed;
        if (available < creditsNeeded) {
          return NextResponse.json(
            { error: `Necesitas ${creditsNeeded} crédito(s) (tú + ${guests.length} invitado(s)), pero solo tienes ${available}.` },
            { status: 402 },
          );
        }
      }
      // If creditsTotal is null → unlimited, no check needed (unless monthlyGuestPasses applies, already checked above)

      // Deduct credits: 1 for self + 1 per guest
      for (let i = 0; i < creditsNeeded; i++) {
        await deductCredit(userPackage.id, classTypeId);
      }
      packageUsedId = userPackage.id;
    }

    // Create main booking
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

    // Create guest bookings
    const guestBookings = [];
    for (const g of guests) {
      const gb = await prisma.booking.create({
        data: {
          tenantId: tenant.id,
          classId,
          userId: null,
          guestName: g.name.trim(),
          guestEmail: g.email.trim().toLowerCase(),
          spotNumber: g.spotNumber ?? null,
          privacy: privacy === "PRIVATE" ? "PRIVATE" : "PUBLIC",
          status: "CONFIRMED",
          packageUsed: packageUsedId,
          parentBookingId: booking.id,
        },
      });
      guestBookings.push(gb);
    }

    if (session?.user?.id) {
      removeSpotNotifyMe(classId, session.user.id);
    }

    if (packageUsedId) {
      await recognizeBookingSafe({
        userPackageId: packageUsedId,
        bookingId: booking.id,
        classId,
        scheduledAt: classData.startsAt,
        scope: "bookings",
      });
      for (const gb of guestBookings) {
        await recognizeBookingSafe({
          userPackageId: packageUsedId,
          bookingId: gb.id,
          classId,
          scheduledAt: classData.startsAt,
          scope: "bookings.guest",
        });
      }
    }

    const baseUrl = getTenantBaseUrl(tenant.slug);

    // Send confirmation to the main booker
    const recipientEmail = session?.user?.email ?? guestEmail;
    const recipientName = session?.user?.name ?? guestName;
    if (recipientEmail && recipientName) {
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

    // Send confirmation emails to each guest
    for (const g of guests) {
      sendBookingConfirmation({
        to: g.email.trim().toLowerCase(),
        name: g.name.trim(),
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

    return NextResponse.json({ ...booking, guestBookings }, { status: 201 });
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
