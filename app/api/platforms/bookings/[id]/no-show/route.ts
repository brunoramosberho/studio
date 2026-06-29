// Internal no-show for a Wellhub booking.
//
// A Wellhub member can check in on the Wellhub app (which pays the studio more
// than a no-show) but never actually show up to the class. This lets the front
// desk free the physical seat for someone else WITHOUT losing the Wellhub
// payment: the PlatformBooking stays `checked_in` (Wellhub still pays), but the
// seat-holding companion is flipped to NO_SHOW so it stops occupying the room
// and the freed seat cascades to the waitlist / Wellhub availability.
//
// Toggle: { noShow: true } frees the seat, { noShow: false } restores it.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { PLATFORM_CONSUMING_STATUSES } from "@/lib/booking/availability";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK", "COACH");
    const tenant = ctx.tenant;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const noShow = body.noShow !== false; // default true

    const pb = await prisma.platformBooking.findFirst({
      where: { id, tenantId: tenant.id, platform: "wellhub" },
      select: {
        id: true,
        classId: true,
        status: true,
        notes: true,
        companionBooking: { select: { id: true, status: true } },
      },
    });
    if (!pb) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (!pb.companionBooking) {
      return NextResponse.json({ error: "No seat to release" }, { status: 400 });
    }

    if (noShow) {
      // Free the seat: companion → NO_SHOW, release the quota counter. Keep the
      // PlatformBooking status (typically checked_in) so Wellhub still pays.
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: pb.companionBooking!.id },
          data: { status: "NO_SHOW", spotNumber: null },
        });
        // The booking was occupying a platform seat → release the quota.
        if ((PLATFORM_CONSUMING_STATUSES as string[]).includes(pb.status)) {
          await tx.schedulePlatformQuota.updateMany({
            where: { classId: pb.classId, platform: "wellhub", bookedSpots: { gt: 0 } },
            data: { bookedSpots: { decrement: 1 } },
          });
        }
        await tx.platformBooking.update({
          where: { id: pb.id },
          data: { notes: "wellhub_internal_no_show" },
        });
      });

      // A seat opened → promote waitlist, notify watchers, re-sync availability.
      const { cascadeFreedSeat } = await import("@/lib/platforms/wellhub");
      cascadeFreedSeat(pb.classId, tenant.id).catch((err) =>
        console.error("[wellhub] no-show cascade failed", err),
      );

      return NextResponse.json({ success: true, seatFreed: true });
    }

    // Undo: restore the seat. Re-assign a free spot and re-take the quota.
    const cls = await prisma.class.findUnique({
      where: { id: pb.classId },
      select: {
        room: { select: { maxCapacity: true, layout: true } },
      },
    });
    let spot: number | null = null;
    const layout = cls?.room?.layout as { spots?: unknown[] } | null;
    if (layout?.spots?.length && cls?.room) {
      const [booked, blocked] = await Promise.all([
        prisma.booking.findMany({
          where: { classId: pb.classId, status: { in: ["CONFIRMED", "ATTENDED"] }, spotNumber: { not: null } },
          select: { spotNumber: true },
        }),
        prisma.blockedSpot.findMany({ where: { classId: pb.classId }, select: { spotNumber: true } }),
      ]);
      const taken = new Set<number>();
      for (const b of booked) if (b.spotNumber != null) taken.add(b.spotNumber);
      for (const b of blocked) if (b.spotNumber != null) taken.add(b.spotNumber);
      for (let s = 1; s <= cls.room.maxCapacity; s++) {
        if (!taken.has(s)) { spot = s; break; }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: pb.companionBooking!.id },
        // Restore to ATTENDED — the Wellhub booking is still checked_in.
        data: { status: "ATTENDED", spotNumber: spot },
      });
      await tx.schedulePlatformQuota.updateMany({
        where: { classId: pb.classId, platform: "wellhub" },
        data: { bookedSpots: { increment: 1 } },
      });
      await tx.platformBooking.update({
        where: { id: pb.id },
        data: { notes: null },
      });
    });

    const { patchWellhubCapacityForClass } = await import("@/lib/platforms/wellhub");
    patchWellhubCapacityForClass(pb.classId).catch((err) =>
      console.error("[wellhub] no-show undo capacity sync failed", err),
    );

    return NextResponse.json({ success: true, seatFreed: false, spotNumber: spot });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/platforms/bookings/[id]/no-show error:", error);
    return NextResponse.json({ error: "Failed to mark no-show" }, { status: 500 });
  }
}
