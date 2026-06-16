import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  deductCredit,
  restoreCredit,
  findPackageForClass,
  userPackageIncludeForBooking,
} from "@/lib/credits";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { sendBookingMoved } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Move a member's booking to another class (admin / front-desk action).
 *
 * The booking is updated in place (same booking id, kept history) to the target
 * class, picking a free spot. Credit accounting only changes when the target is
 * a different class type: the source credit is restored and a credit for the
 * target type is consumed (re-selecting a covering package if needed). The
 * source seat is freed via the standard waitlist/Wellhub cascade and the member
 * gets a "booking moved" email + push.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const tenant = ctx.tenant;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const targetClassId = body.targetClassId as string | undefined;
    const requestedSpot =
      typeof body.spotNumber === "number" ? (body.spotNumber as number) : null;
    const notify = body.notify !== false;

    if (!targetClassId) {
      return NextResponse.json(
        { error: "targetClassId required" },
        { status: 400 },
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id, tenantId: tenant.id },
      include: {
        class: { include: { classType: true } },
        user: { select: { id: true, name: true, email: true, locale: true } },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (booking.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "Only confirmed bookings can be moved" },
        { status: 400 },
      );
    }
    if (booking.classId === targetClassId) {
      return NextResponse.json(
        { error: "Booking is already in that class" },
        { status: 400 },
      );
    }

    const target = await prisma.class.findFirst({
      where: { id: targetClassId, tenantId: tenant.id },
      include: {
        classType: true,
        room: {
          select: {
            id: true,
            name: true,
            maxCapacity: true,
            studio: {
              select: { name: true, city: { select: { timezone: true } } },
            },
          },
        },
        coach: { include: { user: { select: { name: true } } } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
    });

    if (!target) {
      return NextResponse.json(
        { error: "Target class not found" },
        { status: 404 },
      );
    }
    if (target.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Target class is cancelled" },
        { status: 400 },
      );
    }
    if (new Date(target.startsAt).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Target class is in the past" },
        { status: 400 },
      );
    }

    // The member must not already have a booking in the target class.
    if (booking.userId) {
      const dupe = await prisma.booking.findFirst({
        where: {
          classId: targetClassId,
          userId: booking.userId,
          status: "CONFIRMED",
        },
        select: { id: true },
      });
      if (dupe) {
        return NextResponse.json(
          { error: "Member is already booked in that class" },
          { status: 409 },
        );
      }
    }

    // Capacity check (accounts for guests travelling with the member).
    const guests = await prisma.booking.findMany({
      where: { parentBookingId: booking.id, status: "CONFIRMED" },
    });
    const party = 1 + guests.length;

    const [takenRows, blockedRows] = await Promise.all([
      prisma.booking.findMany({
        where: {
          classId: targetClassId,
          status: "CONFIRMED",
          spotNumber: { not: null },
        },
        select: { spotNumber: true },
      }),
      prisma.blockedSpot.findMany({
        where: { classId: targetClassId },
        select: { spotNumber: true },
      }),
    ]);

    const spotsLeft =
      target.room.maxCapacity - target._count.bookings - blockedRows.length;
    if (spotsLeft < party) {
      return NextResponse.json(
        { error: "Target class is full", full: true },
        { status: 409 },
      );
    }

    const taken = new Set<number>();
    for (const r of takenRows) if (r.spotNumber != null) taken.add(r.spotNumber);
    for (const r of blockedRows)
      if (r.spotNumber != null) taken.add(r.spotNumber);

    // Whether the target uses positioned spots (member or guests had one, or a
    // specific spot was requested). Capacity-only rooms keep spotNumber null.
    const usesSpots =
      requestedSpot != null ||
      booking.spotNumber != null ||
      guests.some((g) => g.spotNumber != null);

    const pickSpot = (): number | null => {
      if (!usesSpots) return null;
      for (let s = 1; s <= target.room.maxCapacity; s++) {
        if (!taken.has(s)) {
          taken.add(s);
          return s;
        }
      }
      return null;
    };

    let primarySpot: number | null;
    if (requestedSpot != null) {
      if (requestedSpot < 1 || requestedSpot > target.room.maxCapacity) {
        return NextResponse.json({ error: "Invalid spot" }, { status: 400 });
      }
      if (taken.has(requestedSpot)) {
        return NextResponse.json(
          { error: "That spot is taken" },
          { status: 409 },
        );
      }
      taken.add(requestedSpot);
      primarySpot = requestedSpot;
    } else {
      primarySpot = pickSpot();
    }

    const sameType = booking.class.classTypeId === target.classTypeId;

    // ── Credit accounting (only changes when the class type changes) ──────
    let newPackageUsed = booking.packageUsed;
    if (booking.packageUsed && !sameType && booking.userId) {
      await restoreCredit(booking.packageUsed, booking.class.classTypeId);
      const userPackages = await prisma.userPackage.findMany({
        where: {
          userId: booking.userId,
          tenantId: tenant.id,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        include: userPackageIncludeForBooking,
        orderBy: { expiresAt: "asc" },
      });
      const pkg = findPackageForClass(
        userPackages,
        target.classTypeId,
        booking.packageUsed,
      );
      if (!pkg) {
        // Nothing covers the target type — undo the restore and bail out.
        await deductCredit(booking.packageUsed, booking.class.classTypeId);
        return NextResponse.json(
          { error: "El paquete del cliente no cubre ese tipo de clase." },
          { status: 409 },
        );
      }
      await deductCredit(pkg.id, target.classTypeId);
      newPackageUsed = pkg.id;
    }

    const sourceClassId = booking.classId;

    // ── Move the primary booking + guests ────────────────────────────────
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        classId: targetClassId,
        spotNumber: primarySpot,
        packageUsed: newPackageUsed,
        creditLost: false,
        status: "CONFIRMED",
      },
    });

    for (const gb of guests) {
      const gSpot = pickSpot();
      let gPkg = gb.packageUsed;
      if (gb.packageUsed && !sameType) {
        await restoreCredit(gb.packageUsed, booking.class.classTypeId);
        if (newPackageUsed) {
          await deductCredit(newPackageUsed, target.classTypeId);
          gPkg = newPackageUsed;
        }
      }
      await prisma.booking.update({
        where: { id: gb.id },
        data: { classId: targetClassId, spotNumber: gSpot, packageUsed: gPkg },
      });
    }

    // ── Side effects ─────────────────────────────────────────────────────
    // Free the source seat (promote its waitlist, notify watchers, re-sync).
    import("@/lib/platforms/wellhub")
      .then(({ cascadeFreedSeat }) => cascadeFreedSeat(sourceClassId, tenant.id))
      .catch((err) => console.error("Move source cascade failed:", err));

    // Recognise revenue against the new class for pack-backed bookings.
    if (newPackageUsed) {
      await recognizeBookingSafe({
        userPackageId: newPackageUsed,
        bookingId: booking.id,
        classId: targetClassId,
        scheduledAt: target.startsAt,
        scope: "bookings.move",
      });
    }

    // Move the social feed event from the old class to the new one.
    if (booking.userId) {
      prisma.feedEvent
        .deleteMany({
          where: {
            tenantId: tenant.id,
            userId: booking.userId,
            eventType: "CLASS_RESERVED",
            payload: { path: ["classId"], equals: sourceClassId },
          },
        })
        .catch(() => {});
      // Drop any notify-me / waitlist entry on the target class.
      prisma.classNotifyMe
        .delete({
          where: {
            classId_userId: { classId: targetClassId, userId: booking.userId },
          },
        })
        .catch(() => {});
      prisma.waitlist
        .deleteMany({ where: { classId: targetClassId, userId: booking.userId } })
        .catch(() => {});
    }

    // Remove any check-in that referred to the source class.
    if (booking.userId) {
      prisma.checkIn
        .deleteMany({ where: { classId: sourceClassId, memberId: booking.userId } })
        .catch(() => {});
    }

    // Notify the member (email + push).
    if (notify && booking.user?.email && booking.userId) {
      const loc = booking.user.locale || "es";
      const dateLocale = loc === "en" ? undefined : es;
      const fromLabel = `${booking.class.classType.name} · ${format(
        booking.class.startsAt,
        "EEE d MMM",
        { locale: dateLocale },
      )}`;
      const baseUrl = request.nextUrl.origin;

      sendBookingMoved({
        to: booking.user.email,
        name: (booking.user.name ?? "").split(" ")[0] || booking.user.name || "",
        className: target.classType.name,
        coachName: target.coach.name,
        date: target.startsAt,
        startTime: target.startsAt,
        location: target.room.studio.name ?? undefined,
        timezone: target.room.studio.city?.timezone,
        classUrl: `${baseUrl}/class/${targetClassId}`,
        fromLabel,
        locale: loc,
      }).catch((err) => console.error("Move email failed:", err));

      const dateLabel = format(target.startsAt, "EEE d MMM, HH:mm", {
        locale: dateLocale,
      });
      sendPushToUser(
        booking.userId,
        {
          title: loc === "en" ? "Your booking changed" : "Cambiamos tu reserva",
          body:
            loc === "en"
              ? `You're now in ${target.classType.name} · ${dateLabel}.`
              : `Ahora estás en ${target.classType.name} · ${dateLabel}.`,
          url: `/class/${targetClassId}`,
          tag: `booking-moved-${booking.id}`,
        },
        tenant.id,
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      targetClassId,
      spotNumber: primarySpot,
      creditAdjusted: !sameType,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(
        error.message,
      )
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("POST /api/admin/bookings/[id]/move error:", error);
    return NextResponse.json({ error: "Failed to move booking" }, { status: 500 });
  }
}
