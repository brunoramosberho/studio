import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { checkAchievements, createGroupedAchievementEvents } from "@/lib/achievements";
import { promoteFromWaitlist, notifySpotWatchers } from "@/lib/waitlist";
import { restoreCredit } from "@/lib/credits";
import { recognizePenaltySafe } from "@/lib/revenue/hooks";
import { toStripeAmount } from "@/lib/stripe/helpers";
import { format } from "date-fns";
import { es } from "date-fns/locale";

async function getCancellationWindowMs(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { cancellationWindowHours: true },
  });
  return (tenant?.cancellationWindowHours ?? 12) * 60 * 60 * 1000;
}

async function syncCompletedClassFeedEvent(classId: string, tenantId: string) {
  const cls = await prisma.class.findFirst({
    where: { id: classId, tenantId },
    include: {
      classType: true,
      coach: { include: { user: { select: { name: true, image: true } } } },
      bookings: {
        where: { status: "ATTENDED" },
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });
  if (!cls) return;

  const attendees = cls.bookings
    .filter((b) => b.userId)
    .map((b) => ({
      id: b.userId!,
      name: b.user?.name ?? "Miembro",
      image: b.user?.image ?? null,
    }));

  const existingEvent = await prisma.feedEvent.findFirst({
    where: {
      tenantId,
      eventType: "CLASS_COMPLETED",
      payload: { path: ["classId"], equals: classId },
    },
  });

  if (existingEvent) {
    await prisma.feedEvent.update({
      where: { id: existingEvent.id },
      data: {
        payload: {
          ...(existingEvent.payload as object),
          attendees,
          attendeeCount: attendees.length,
        },
      },
    });
  } else if (attendees.length > 0) {
    await prisma.feedEvent.create({
      data: {
        tenantId,
        userId: cls.coach.userId!,
        eventType: "CLASS_COMPLETED",
        visibility: "STUDIO_WIDE",
        createdAt: cls.endsAt,
        payload: {
          classId: cls.id,
          className: cls.classType.name,
          classTypeColor: cls.classType.color,
          classTypeIcon: cls.classType.icon,
          coachName: cls.coach.name,
          coachImage: cls.coach.photoUrl || cls.coach.user?.image,
          coachUserId: cls.coach.userId,
          date: format(cls.startsAt, "EEEE d 'de' MMMM", { locale: es }),
          time: format(cls.startsAt, "h:mm a"),
          duration: cls.classType.duration,
          attendees,
          attendeeCount: attendees.length,
        },
      },
    });
  }
}

/** Returns true if credit was restored, false if it was lost */
async function restoreCreditIfEligible(
  booking: {
    packageUsed: string | null;
    class: { startsAt: Date; classTypeId: string };
  },
  cancellationWindowMs: number,
): Promise<boolean> {
  if (!booking.packageUsed) return true;

  const hoursUntilClass =
    new Date(booking.class.startsAt).getTime() - Date.now();
  if (hoursUntilClass <= cancellationWindowMs) return false;

  await restoreCredit(booking.packageUsed, booking.class.classTypeId);
  return true;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant, membership } = await requireAuth();

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !["ATTENDED", "NO_SHOW", "CANCELLED"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be ATTENDED, NO_SHOW, or CANCELLED" },
        { status: 400 },
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id, tenantId: tenant.id },
      include: { class: true },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 },
      );
    }

    const isOwner = booking.userId === session.user.id;
    const isAdmin = membership.role === "ADMIN";
    const isCoach = membership.role === "COACH";
    if (!isOwner && !isAdmin && !isCoach) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let creditLost = false;
    if (status === "CANCELLED") {
      const windowMs = await getCancellationWindowMs(tenant.id);
      const restored = await restoreCreditIfEligible(booking, windowMs);
      creditLost = !restored;

      // Cancel guest bookings and restore their credits
      const guestBookings = await prisma.booking.findMany({
        where: { parentBookingId: id, status: "CONFIRMED" },
        include: { class: true },
      });
      for (const gb of guestBookings) {
        if (restored) {
          await restoreCreditIfEligible(gb, windowMs);
        }
        await prisma.booking.update({
          where: { id: gb.id },
          data: { status: "CANCELLED", spotNumber: null, creditLost: !restored },
        });
      }
    }

    // No-show penalty logic depends on package type:
    // - Limited credits: credit already consumed on booking → mark creditLost
    // - Unlimited (null creditsTotal): no credit to lose → apply fee if configured
    let noShowFeeApplied = false;
    let noShowFeeAmountCents = 0;
    if (status === "NO_SHOW") {
      creditLost = true; // Credit used for this class is always lost on no-show

      if (booking.packageUsed) {
        const tenantConfig = await prisma.tenant.findUnique({
          where: { id: tenant.id },
          select: { noShowPenaltyEnabled: true, noShowPenaltyAmount: true },
        });

        // Check if user has an unlimited package (creditsTotal === null)
        const userPkg = await prisma.userPackage.findUnique({
          where: { id: booking.packageUsed },
          select: { creditsTotal: true },
        });

        const isUnlimited = userPkg?.creditsTotal === null;

        if (isUnlimited && tenantConfig?.noShowPenaltyEnabled && tenantConfig.noShowPenaltyAmount) {
          noShowFeeApplied = true;
          noShowFeeAmountCents = toStripeAmount(tenantConfig.noShowPenaltyAmount);
          // The fee amount is stored in tenant config — actual charging handled externally
        }
      }
    }

    const updated = await prisma.booking.update({
      where: { id, tenantId: tenant.id },
      data: {
        status,
        ...(status === "CANCELLED" ? { spotNumber: null, creditLost } : {}),
        ...(status === "NO_SHOW" ? { creditLost } : {}),
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

    if (status === "CANCELLED") {
      promoteFromWaitlist(booking.classId, tenant.id)
        .then(() => notifySpotWatchers(booking.classId, tenant.id))
        .catch((err) => console.error("Waitlist promotion / spot notify failed:", err));
    }

    if (status === "ATTENDED" && booking.userId) {
      checkAchievements(booking.userId, tenant.id)
        .then((grants) => {
          if (grants.length > 0) return createGroupedAchievementEvents(grants, tenant.id);
        })
        .catch((err) => console.error("Achievement check failed:", err));

      // Sync: create CheckIn if not exists
      prisma.checkIn.upsert({
        where: { classId_memberId: { classId: booking.classId, memberId: booking.userId } },
        create: {
          tenantId: tenant.id,
          classId: booking.classId,
          memberId: booking.userId,
          checkedInBy: session.user.id,
          method: "manual",
          status: new Date() > booking.class.startsAt ? "late" : "present",
        },
        update: {},
      }).catch((err) => console.error("Attendance→CheckIn sync failed:", err));
    }

    if ((status === "NO_SHOW" || status === "CANCELLED") && booking.userId) {
      // Sync: remove CheckIn if exists
      prisma.checkIn.deleteMany({
        where: { classId: booking.classId, memberId: booking.userId },
      }).catch((err) => console.error("Attendance→CheckIn removal sync failed:", err));
    }

    if ((status === "ATTENDED" || status === "NO_SHOW") && booking.class.status === "COMPLETED") {
      syncCompletedClassFeedEvent(booking.classId, tenant.id).catch((err) =>
        console.error("Feed event sync failed:", err),
      );
    }

    if (noShowFeeApplied && noShowFeeAmountCents > 0 && booking.userId) {
      await recognizePenaltySafe({
        tenantId: tenant.id,
        userId: booking.userId,
        classId: booking.classId,
        amountCents: noShowFeeAmountCents,
        chargedAt: new Date(),
      });
    }

    return NextResponse.json({ ...updated, noShowFeeApplied });
  } catch (error) {
    console.error("PUT /api/bookings/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update booking" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant, membership } = await requireAuth();

    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id, tenantId: tenant.id },
      include: { class: true },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 },
      );
    }

    const isOwner = booking.userId === session.user.id;
    const isAdmin = membership.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const windowMs = await getCancellationWindowMs(tenant.id);
    const restored = await restoreCreditIfEligible(booking, windowMs);

    // Cancel guest bookings and restore their credits
    const guestBookings = await prisma.booking.findMany({
      where: { parentBookingId: id, status: "CONFIRMED" },
      include: { class: true },
    });
    for (const gb of guestBookings) {
      if (restored) {
        await restoreCreditIfEligible(gb, windowMs);
      }
      await prisma.booking.update({
        where: { id: gb.id },
        data: { status: "CANCELLED", spotNumber: null, creditLost: !restored },
      });
    }

    const cancelled = await prisma.booking.update({
      where: { id, tenantId: tenant.id },
      data: { status: "CANCELLED", spotNumber: null, creditLost: !restored },
    });

    if (booking.userId) {
      prisma.feedEvent
        .deleteMany({
          where: {
            tenantId: tenant.id,
            userId: booking.userId,
            eventType: "CLASS_RESERVED",
            payload: { path: ["classId"], equals: booking.classId },
          },
        })
        .catch(() => {});
    }

    promoteFromWaitlist(booking.classId, tenant.id)
      .then(() => notifySpotWatchers(booking.classId, tenant.id))
      .catch((err) => console.error("Waitlist promotion / spot notify failed:", err));

    return NextResponse.json(cancelled);
  } catch (error) {
    console.error("DELETE /api/bookings/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 },
    );
  }
}
