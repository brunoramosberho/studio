import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { sendBookingConfirmation, getTenantBaseUrl } from "@/lib/email";
import {
  findPackageForClass,
  deductCredit,
  restoreCredit,
  userPackageIncludeForBooking,
  ensureSubscriptionUserPackages,
} from "@/lib/credits";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { shouldHideCoach } from "@/lib/coach";
import { platformBookedNoCompanionWhere } from "@/lib/booking/availability";

const AUTH_ERRORS = [
  "Unauthorized",
  "Forbidden",
  "Not a member of this studio",
  "Tenant not found",
];

/**
 * Add one or more guests to a booking the member already holds.
 *
 * This mirrors the guest-creation path of POST /api/bookings, but is scoped to
 * an existing CONFIRMED booking so a member can invite someone *after* they've
 * already reserved their own spot. Each new guest is a Booking row with
 * `userId: null`, the inviter's `parentBookingId`, and one credit deducted from
 * the inviter's package.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { id: parentBookingId } = await params;
    const body = await request.json();
    const guests: { name: string; email: string; spotNumber?: number }[] =
      body.guests ?? [];

    if (!Array.isArray(guests) || guests.length === 0) {
      return NextResponse.json(
        { error: "Agrega al menos un invitado" },
        { status: 400 },
      );
    }
    for (const g of guests) {
      if (!g.name?.trim() || !g.email?.trim()) {
        return NextResponse.json(
          { error: "Cada invitado requiere nombre completo y correo electrónico" },
          { status: 400 },
        );
      }
    }

    // The parent booking must belong to this member, in this tenant, and be
    // active. We only ever attach guests to the member's own reservation.
    const parentBooking = await prisma.booking.findFirst({
      where: {
        id: parentBookingId,
        tenantId: tenant.id,
        userId: session.user.id,
        status: "CONFIRMED",
      },
    });
    if (!parentBooking) {
      return NextResponse.json(
        { error: "No encontramos tu reserva para esta clase" },
        { status: 404 },
      );
    }

    const classId = parentBooking.classId;
    const classData = await prisma.class.findUnique({
      where: { id: classId, tenantId: tenant.id },
      include: {
        classType: true,
        room: {
          include: {
            studio: { include: { city: { select: { timezone: true } } } },
          },
        },
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
    if (classData.startsAt <= new Date()) {
      return NextResponse.json(
        { error: "Ya no puedes agregar invitados a esta clase" },
        { status: 400 },
      );
    }

    // Capacity: need one open spot per new guest.
    const blockedCount = await prisma.blockedSpot.count({ where: { classId } });
    const platformBooked = await prisma.platformBooking.count({
      where: platformBookedNoCompanionWhere(classId),
    });
    const spotsLeft =
      classData.room.maxCapacity -
      classData._count.bookings -
      blockedCount -
      platformBooked;
    if (spotsLeft < guests.length) {
      return NextResponse.json(
        {
          error:
            spotsLeft <= 0
              ? "La clase está llena."
              : `No hay suficientes lugares. Solo quedan ${spotsLeft} lugar(es) disponible(s).`,
          full: spotsLeft <= 0,
        },
        { status: 409 },
      );
    }

    // Validate guest spot numbers (range, no dupes, free + not blocked).
    const allSpots: number[] = [];
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
    const uniqueSpots = new Set(allSpots);
    if (uniqueSpots.size !== allSpots.length) {
      return NextResponse.json(
        { error: "No puedes seleccionar el mismo lugar para más de una persona" },
        { status: 400 },
      );
    }
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

    // Resolve the package that will cover the guests' credits.
    await ensureSubscriptionUserPackages(session.user.id, tenant.id);
    const userPackages = await prisma.userPackage.findMany({
      where: {
        userId: session.user.id,
        tenantId: tenant.id,
        status: "ACTIVE",
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
    const userPackage = findPackageForClass(
      userPackages,
      classTypeId,
      body.packageId,
      classData.startsAt,
    );

    if (!userPackage) {
      return NextResponse.json(
        { error: "No valid package with available credits" },
        { status: 402 },
      );
    }

    const pkg = userPackage.package as any;

    if (!pkg.allowGuests) {
      return NextResponse.json(
        { error: "Tu paquete no permite agregar invitados" },
        { status: 403 },
      );
    }

    // maxGuestsPerBooking counts the guests already on this booking.
    if (pkg.maxGuestsPerBooking != null) {
      const existingGuests = await prisma.booking.count({
        where: {
          tenantId: tenant.id,
          parentBookingId: parentBooking.id,
          status: { in: ["CONFIRMED", "ATTENDED"] },
        },
      });
      if (existingGuests + guests.length > pkg.maxGuestsPerBooking) {
        const remaining = Math.max(0, pkg.maxGuestsPerBooking - existingGuests);
        return NextResponse.json(
          {
            error: `Máximo ${pkg.maxGuestsPerBooking} invitado(s) por reserva. Te queda(n) ${remaining}.`,
          },
          { status: 400 },
        );
      }
    }

    // Unlimited packages: respect the monthly guest-pass cap.
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
          {
            error: `Te quedan ${remaining} pase(s) de invitado este mes. Intentas agregar ${guests.length}.`,
          },
          { status: 400 },
        );
      }
    }

    // Credits: one per guest.
    const creditsNeeded = guests.length;
    const hasAllocations = userPackage.creditUsages.length > 0;
    if (hasAllocations) {
      const usage = userPackage.creditUsages.find(
        (u) => u.classTypeId === classTypeId,
      );
      const available = usage ? usage.creditsTotal - usage.creditsUsed : 0;
      if (available < creditsNeeded) {
        return NextResponse.json(
          {
            error: `Necesitas ${creditsNeeded} crédito(s) para tus invitados, pero solo tienes ${available}.`,
          },
          { status: 402 },
        );
      }
    } else if (userPackage.creditsTotal !== null) {
      const available = userPackage.creditsTotal - userPackage.creditsUsed;
      if (available < creditsNeeded) {
        return NextResponse.json(
          {
            error: `Necesitas ${creditsNeeded} crédito(s) para tus invitados, pero solo tienes ${available}.`,
          },
          { status: 402 },
        );
      }
    }
    // creditsTotal === null with no allocations → unlimited (guest-pass cap
    // already checked above).

    for (let i = 0; i < creditsNeeded; i++) {
      await deductCredit(userPackage.id, classTypeId);
    }

    // Create the guest bookings. If a row fails (e.g. spot stolen → P2002),
    // restore the credits that didn't end up backing a seat.
    const guestBookings = [];
    try {
      for (const g of guests) {
        const gb = await prisma.booking.create({
          data: {
            tenantId: tenant.id,
            classId,
            userId: null,
            guestName: g.name.trim(),
            guestEmail: g.email.trim().toLowerCase(),
            spotNumber: g.spotNumber ?? null,
            privacy: parentBooking.privacy,
            status: "CONFIRMED",
            packageUsed: userPackage.id,
            parentBookingId: parentBooking.id,
          },
        });
        guestBookings.push(gb);
      }
    } catch (err) {
      const toRestore = creditsNeeded - guestBookings.length;
      for (let i = 0; i < toRestore; i++) {
        await restoreCredit(userPackage.id, classTypeId).catch((e) =>
          console.error("Failed to restore credit on add-guest error", e),
        );
      }
      throw err;
    }

    for (const gb of guestBookings) {
      await recognizeBookingSafe({
        userPackageId: userPackage.id,
        bookingId: gb.id,
        classId,
        scheduledAt: classData.startsAt,
        scope: "bookings.guest",
      });
    }

    // Keep Wellhub's view of remaining capacity in sync. No-op when unsynced.
    try {
      const { patchWellhubCapacityForClass } = await import("@/lib/platforms/wellhub");
      await patchWellhubCapacityForClass(classId);
    } catch (err) {
      console.error("[wellhub] capacity patch after add-guest failed", err);
    }

    const baseUrl = getTenantBaseUrl(tenant.slug);
    const hideCoach = shouldHideCoach(tenant, classData);
    const emailCoachName = hideCoach ? null : (classData.coach.name ?? "Coach");
    for (const g of guests) {
      sendBookingConfirmation({
        to: g.email.trim().toLowerCase(),
        name: g.name.trim(),
        className: classData.classType.name,
        coachName: emailCoachName,
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.room.studio.name ?? undefined,
        timezone: classData.room.studio.city?.timezone,
        classUrl: `${baseUrl}/class/${classId}`,
      });
    }

    return NextResponse.json({ guestBookings }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ese lugar ya está ocupado. Selecciona otro." },
        { status: 409 },
      );
    }
    if (error instanceof Error && AUTH_ERRORS.includes(error.message)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("POST /api/bookings/[id]/guests error:", error);
    return NextResponse.json(
      { error: "Failed to add guests" },
      { status: 500 },
    );
  }
}
