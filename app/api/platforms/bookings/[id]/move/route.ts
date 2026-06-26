// Move a Wellhub (platform) booking to another class. Used to correct the edge
// case where a walk-in or time-matched check-in landed on the wrong class.
//
// Unlike the member-booking move, there is no credit/email accounting — a
// platform booking is paid by the platform. We move the PlatformBooking AND its
// seat-holding companion together, preserve the check-in status, re-spot in the
// target, fix the quota counters on both classes, and free the source seat
// (waitlist promotion + Wellhub capacity re-sync) via the standard cascade.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  MAGIC_CONSUMING_STATUSES,
  PLATFORM_CONSUMING_STATUSES,
} from "@/lib/booking/availability";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK", "COACH");
    const tenant = ctx.tenant;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const targetClassId = body.targetClassId as string | undefined;
    if (!targetClassId) {
      return NextResponse.json({ error: "targetClassId required" }, { status: 400 });
    }

    const pb = await prisma.platformBooking.findFirst({
      where: { id, tenantId: tenant.id, platform: "wellhub" },
      select: {
        id: true,
        classId: true,
        status: true,
        wellhubUserUniqueToken: true,
        companionBooking: { select: { id: true, status: true } },
      },
    });
    if (!pb) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (pb.classId === targetClassId) {
      return NextResponse.json({ error: "Booking is already in that class" }, { status: 400 });
    }
    if (pb.status === "cancelled" || pb.status === "rejected") {
      return NextResponse.json({ error: "Cannot move a cancelled booking" }, { status: 400 });
    }

    const target = await prisma.class.findFirst({
      where: { id: targetClassId, tenantId: tenant.id },
      select: {
        id: true,
        status: true,
        startsAt: true,
        room: { select: { maxCapacity: true, layout: true } },
        classType: { select: { wellhubProductId: true } },
        _count: {
          select: {
            bookings: { where: { status: { in: [...MAGIC_CONSUMING_STATUSES] } } },
            blockedSpots: true,
          },
        },
      },
    });
    if (!target?.room) {
      return NextResponse.json({ error: "Target class not found" }, { status: 404 });
    }
    if (target.status === "CANCELLED") {
      return NextResponse.json({ error: "Target class is cancelled" }, { status: 400 });
    }

    // The member must not already have a wellhub booking on the target class.
    if (pb.wellhubUserUniqueToken) {
      const dupe = await prisma.platformBooking.findFirst({
        where: {
          classId: targetClassId,
          platform: "wellhub",
          wellhubUserUniqueToken: pb.wellhubUserUniqueToken,
          status: { not: "cancelled" },
        },
        select: { id: true },
      });
      if (dupe) {
        return NextResponse.json(
          { error: "Ese miembro ya tiene una reserva de Wellhub en esa clase" },
          { status: 409 },
        );
      }
    }

    // Physical capacity check on the target (shared across channels). A
    // consummated check-in is a fact, so we still allow it through when full
    // for already-checked-in bookings, but block confirmed (not-yet-arrived)
    // moves into a physically full class.
    const targetPlatformBooked = await prisma.platformBooking.count({
      where: { classId: targetClassId, status: { in: PLATFORM_CONSUMING_STATUSES } },
    });
    const physicalLeft =
      target.room.maxCapacity -
      target._count.bookings -
      target._count.blockedSpots -
      targetPlatformBooked;
    if (physicalLeft <= 0 && pb.status !== "checked_in") {
      return NextResponse.json({ error: "Target class is full", full: true }, { status: 409 });
    }

    // Pick a free spot in the target (only when the target room uses a layout).
    const layout = target.room.layout as { spots?: unknown[] } | null;
    let targetSpot: number | null = null;
    if (layout?.spots?.length) {
      const [booked, blocked] = await Promise.all([
        prisma.booking.findMany({
          where: { classId: targetClassId, status: { in: [...MAGIC_CONSUMING_STATUSES] }, spotNumber: { not: null } },
          select: { spotNumber: true },
        }),
        prisma.blockedSpot.findMany({ where: { classId: targetClassId }, select: { spotNumber: true } }),
      ]);
      const taken = new Set<number>();
      for (const b of booked) if (b.spotNumber != null) taken.add(b.spotNumber);
      for (const b of blocked) if (b.spotNumber != null) taken.add(b.spotNumber);
      for (let s = 1; s <= target.room.maxCapacity; s++) {
        if (!taken.has(s)) { targetSpot = s; break; }
      }
    }

    const sourceClassId = pb.classId;
    const wasConsuming = (PLATFORM_CONSUMING_STATUSES as string[]).includes(pb.status);

    await prisma.$transaction(async (tx) => {
      // Move the PlatformBooking.
      await tx.platformBooking.update({
        where: { id: pb.id },
        data: { classId: targetClassId },
      });
      // Move its companion seat (if any) and re-spot it.
      if (pb.companionBooking) {
        await tx.booking.update({
          where: { id: pb.companionBooking.id },
          data: { classId: targetClassId, spotNumber: targetSpot },
        });
      }
      // Quota counters: release on source, take on target (only if the booking
      // was occupying — confirmed/checked_in/pending). Walk-ins on classes
      // without a quota row simply have nothing to decrement/increment.
      if (wasConsuming) {
        await tx.schedulePlatformQuota.updateMany({
          where: { classId: sourceClassId, platform: "wellhub", bookedSpots: { gt: 0 } },
          data: { bookedSpots: { decrement: 1 } },
        });
        await tx.schedulePlatformQuota.updateMany({
          where: { classId: targetClassId, platform: "wellhub" },
          data: { bookedSpots: { increment: 1 } },
        });
      }
    });

    // Free the source seat downstream (waitlist promote + notify + Wellhub
    // capacity re-sync), and refresh the target's Wellhub capacity too.
    const { cascadeFreedSeat, patchWellhubCapacityForClass } = await import("@/lib/platforms/wellhub");
    cascadeFreedSeat(sourceClassId, tenant.id).catch((err) =>
      console.error("[wellhub] move source cascade failed", err),
    );
    patchWellhubCapacityForClass(targetClassId).catch((err) =>
      console.error("[wellhub] move target capacity sync failed", err),
    );

    return NextResponse.json({
      success: true,
      platformBookingId: pb.id,
      targetClassId,
      spotNumber: targetSpot,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/platforms/bookings/[id]/move error:", error);
    return NextResponse.json({ error: "Failed to move booking" }, { status: 500 });
  }
}
