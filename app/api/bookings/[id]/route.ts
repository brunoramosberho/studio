import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { checkAchievements, createGroupedAchievementEvents } from "@/lib/achievements";
import { sendPushToUser } from "@/lib/push";

const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1000;

async function restoreCreditIfEligible(booking: {
  packageUsed: string | null;
  class: { startsAt: Date };
}) {
  if (!booking.packageUsed) return;

  const hoursUntilClass =
    new Date(booking.class.startsAt).getTime() - Date.now();
  if (hoursUntilClass <= CANCELLATION_WINDOW_MS) return;

  await prisma.userPackage.update({
    where: { id: booking.packageUsed },
    data: { creditsUsed: { decrement: 1 } },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      where: { id },
      include: { class: true },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 },
      );
    }

    const isOwner = booking.userId === session.user.id;
    const isAdmin = session.user.role === "ADMIN";
    const isCoach = session.user.role === "COACH";
    if (!isOwner && !isAdmin && !isCoach) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (status === "CANCELLED") {
      await restoreCreditIfEligible(booking);
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status,
        ...(status === "CANCELLED" ? { spotNumber: null } : {}),
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
        where: { classId: booking.classId },
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
      checkAchievements(booking.userId)
        .then((grants) => {
          if (grants.length > 0) return createGroupedAchievementEvents(grants);
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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { class: true },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 },
      );
    }

    const isOwner = booking.userId === session.user.id;
    const isAdmin = session.user.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await restoreCreditIfEligible(booking);

    const cancelled = await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED", spotNumber: null },
    });

    // Notify waitlisted users that a spot opened up
    const waitlisted = await prisma.waitlist.findMany({
      where: { classId: booking.classId },
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
