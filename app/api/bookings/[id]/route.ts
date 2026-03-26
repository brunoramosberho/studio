import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { checkAchievements, createGroupedAchievementEvents } from "@/lib/achievements";
import { sendPushToUser } from "@/lib/push";

const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1000;

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
      const waitlisted = await prisma.waitlist.findMany({
        where: { classId: booking.classId, tenantId: tenant.id },
        include: {
          class: { include: { classType: { select: { name: true } } } },
        },
        orderBy: { position: "asc" },
        take: 3,
      });
      for (const w of waitlisted) {
        sendPushToUser(w.userId, {
          title: "Lugar disponible",
          body: `Se liberó un lugar en ${w.class.classType.name}`,
          url: `/class/${booking.classId}`,
          tag: `waitlist-${booking.classId}`,
        }).catch(() => {});
      }
    }

    if (status === "ATTENDED" && booking.userId) {
      checkAchievements(booking.userId, tenant.id)
        .then((grants) => {
          if (grants.length > 0) return createGroupedAchievementEvents(grants, tenant.id);
        })
        .catch((err) => console.error("Achievement check failed:", err));
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

    // Notify waitlisted users that a spot opened up
    const waitlisted = await prisma.waitlist.findMany({
      where: { classId: booking.classId, tenantId: tenant.id },
      include: {
        class: { include: { classType: { select: { name: true } } } },
      },
      orderBy: { position: "asc" },
      take: 3,
    });
    for (const w of waitlisted) {
      sendPushToUser(w.userId, {
        title: "Lugar disponible",
        body: `Se liberó un lugar en ${w.class.classType.name}`,
        url: `/class/${booking.classId}`,
        tag: `waitlist-${booking.classId}`,
      }).catch(() => {});
    }

    return NextResponse.json(cancelled);
  } catch (error) {
    console.error("DELETE /api/bookings/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 },
    );
  }
}
