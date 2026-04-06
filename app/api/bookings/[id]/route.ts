import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { checkAchievements, createGroupedAchievementEvents } from "@/lib/achievements";
import { promoteFromWaitlist } from "@/lib/waitlist";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1000;

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
        userId: cls.coach.userId,
        eventType: "CLASS_COMPLETED",
        visibility: "STUDIO_WIDE",
        createdAt: cls.endsAt,
        payload: {
          classId: cls.id,
          className: cls.classType.name,
          classTypeColor: cls.classType.color,
          classTypeIcon: cls.classType.icon,
          coachName: cls.coach.user.name,
          coachImage: cls.coach.photoUrl || cls.coach.user.image,
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
async function restoreCreditIfEligible(booking: {
  packageUsed: string | null;
  class: { startsAt: Date };
}): Promise<boolean> {
  if (!booking.packageUsed) return true;

  const hoursUntilClass =
    new Date(booking.class.startsAt).getTime() - Date.now();
  if (hoursUntilClass <= CANCELLATION_WINDOW_MS) return false;

  await prisma.userPackage.update({
    where: { id: booking.packageUsed },
    data: { creditsUsed: { decrement: 1 } },
  });
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
      const restored = await restoreCreditIfEligible(booking);
      creditLost = !restored;
    }

    const updated = await prisma.booking.update({
      where: { id, tenantId: tenant.id },
      data: {
        status,
        ...(status === "CANCELLED" ? { spotNumber: null, creditLost } : {}),
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
      promoteFromWaitlist(booking.classId, tenant.id).catch((err) =>
        console.error("Waitlist promotion failed:", err),
      );
    }

    if (status === "ATTENDED" && booking.userId) {
      checkAchievements(booking.userId, tenant.id)
        .then((grants) => {
          if (grants.length > 0) return createGroupedAchievementEvents(grants, tenant.id);
        })
        .catch((err) => console.error("Achievement check failed:", err));
    }

    if ((status === "ATTENDED" || status === "NO_SHOW") && booking.class.status === "COMPLETED") {
      syncCompletedClassFeedEvent(booking.classId, tenant.id).catch((err) =>
        console.error("Feed event sync failed:", err),
      );
    }

    return NextResponse.json(updated);
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

    const restored = await restoreCreditIfEligible(booking);

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

    promoteFromWaitlist(booking.classId, tenant.id).catch((err) =>
      console.error("Waitlist promotion failed:", err),
    );

    return NextResponse.json(cancelled);
  } catch (error) {
    console.error("DELETE /api/bookings/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 },
    );
  }
}
