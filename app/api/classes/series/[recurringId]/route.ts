import { NextRequest, NextResponse } from "next/server";
import { addMinutes } from "date-fns";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { cancelClassWithRefunds } from "@/lib/class-cancel";
import { formatDateInZone, zonedWallTimeToUtc } from "@/lib/utils";
import { normalizeRules } from "@/lib/song-rules";

const FALLBACK_TZ = "Europe/Madrid";

/**
 * GET /api/classes/series/[recurringId]
 * Get all classes in a recurring series.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ recurringId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK", "COACH");
    const { recurringId } = await params;

    const classes = await prisma.class.findMany({
      where: { recurringId, tenantId: ctx.tenant.id },
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: {
          select: {
            id: true, name: true, photoUrl: true,
            user: { select: { name: true, image: true } },
          },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json(classes);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/classes/series/[recurringId] error:", error);
    return NextResponse.json({ error: "Failed to fetch series" }, { status: 500 });
  }
}

/**
 * PUT /api/classes/series/[recurringId]
 * Update classes in a recurring series.
 * Query params:
 *   scope=all         - update all future scheduled classes in series
 *   scope=from&fromId=<classId> - update this class and all future ones in series
 * Body: partial class fields (coachId, roomId, classTypeId, tag,
 *   songRequestsEnabled, songRequestRules, time, duration).
 * When time/duration are sent, the change is only applied if no live
 * reservations exist on any affected class (bookings, waitlist, platform
 * bookings) — otherwise we'd silently shift booked clients to a new slot.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recurringId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { recurringId } = await params;
    const scope = request.nextUrl.searchParams.get("scope") ?? "all";
    const fromId = request.nextUrl.searchParams.get("fromId");

    const body = await request.json();
    const { coachId, roomId, classTypeId, tag, songRequestsEnabled, songRequestRules, time, duration } = body;

    const isReschedule = typeof time === "string" || typeof duration === "number";
    if (typeof time === "string" && !/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json({ error: "Invalid time format" }, { status: 400 });
    }
    if (typeof duration === "number" && (!Number.isFinite(duration) || duration < 15 || duration > 240)) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (coachId !== undefined) data.coachId = coachId;
    if (roomId !== undefined) data.roomId = roomId;
    if (classTypeId !== undefined) data.classTypeId = classTypeId;
    if (tag !== undefined) data.tag = tag || null;
    if (songRequestsEnabled !== undefined) data.songRequestsEnabled = songRequestsEnabled;
    if (songRequestRules !== undefined) data.songRequestRules = normalizeRules(songRequestRules);

    if (Object.keys(data).length === 0 && !isReschedule) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const startsAtFilter: { gt: Date; gte?: Date } = { gt: new Date() };
    if (scope === "from" && fromId) {
      const fromClass = await prisma.class.findFirst({
        where: { id: fromId, recurringId, tenantId: ctx.tenant.id },
        select: { startsAt: true },
      });
      if (fromClass) startsAtFilter.gte = fromClass.startsAt;
    }

    if (!isReschedule) {
      const result = await prisma.class.updateMany({
        where: {
          recurringId,
          tenantId: ctx.tenant.id,
          status: "SCHEDULED",
          startsAt: startsAtFilter,
        },
        data,
      });
      return NextResponse.json({ count: result.count });
    }

    // Reschedule path: per-class update with booking + conflict guards.
    const affected = await prisma.class.findMany({
      where: {
        recurringId,
        tenantId: ctx.tenant.id,
        status: "SCHEDULED",
        startsAt: startsAtFilter,
      },
      include: { room: { include: { studio: { include: { city: true } } } } },
      orderBy: { startsAt: "asc" },
    });

    if (affected.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const classIds = affected.map((c) => c.id);

    const [bookingCount, waitlistCount, platformCount] = await Promise.all([
      prisma.booking.count({
        where: {
          tenantId: ctx.tenant.id,
          classId: { in: classIds },
          status: { in: ["CONFIRMED", "ATTENDED"] },
        },
      }),
      prisma.waitlist.count({ where: { classId: { in: classIds } } }),
      prisma.platformBooking.count({
        where: {
          tenantId: ctx.tenant.id,
          classId: { in: classIds },
          status: { notIn: ["cancelled", "absent", "rejected"] },
        },
      }),
    ]);

    if (bookingCount + waitlistCount + platformCount > 0) {
      return NextResponse.json(
        {
          error: "Series has live reservations",
          bookings: bookingCount,
          waitlist: waitlistCount,
          platformBookings: platformCount,
        },
        { status: 409 },
      );
    }

    // Compute new start/end per class (keep each class's date, swap the
    // wall-clock time + duration in the studio's tz so DST is handled).
    const newDuration = typeof duration === "number"
      ? duration
      : null;
    const [newHh, newMm] = typeof time === "string"
      ? time.split(":").map(Number)
      : [null, null];

    type PerClassUpdate = {
      id: string;
      startsAt: Date;
      endsAt: Date;
      roomId: string;
      coachId: string;
    };
    const updates: PerClassUpdate[] = [];
    for (const c of affected) {
      const tz = c.room?.studio?.city?.timezone ?? FALLBACK_TZ;
      const dateStr = formatDateInZone(c.startsAt, tz);
      const [y, m, d] = dateStr.split("-").map(Number);
      const currentDurationMin = Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / 60000);
      const startsAt = newHh != null && newMm != null
        ? zonedWallTimeToUtc(y, m - 1, d, newHh, newMm, tz)
        : c.startsAt;
      const endsAt = addMinutes(startsAt, newDuration ?? currentDurationMin);
      updates.push({
        id: c.id,
        startsAt,
        endsAt,
        roomId: (data.roomId as string) ?? c.roomId,
        coachId: (data.coachId as string) ?? c.coachId,
      });
    }

    // Conflict detection: find other (non-cancelled, not-in-series) classes
    // that share a room or coach we'll occupy and overlap any new slot.
    const roomIds = Array.from(new Set(updates.map((u) => u.roomId)));
    const coachIds = Array.from(new Set(updates.map((u) => u.coachId)));
    const windowStart = updates.reduce((min, u) => u.startsAt < min ? u.startsAt : min, updates[0].startsAt);
    const windowEnd = updates.reduce((max, u) => u.endsAt > max ? u.endsAt : max, updates[0].endsAt);

    const others = await prisma.class.findMany({
      where: {
        tenantId: ctx.tenant.id,
        id: { notIn: classIds },
        status: { not: "CANCELLED" },
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
        OR: [
          { roomId: { in: roomIds } },
          { coachId: { in: coachIds } },
        ],
      },
      select: {
        id: true, startsAt: true, endsAt: true, roomId: true, coachId: true,
        classType: { select: { name: true } },
        room: { select: { name: true } },
      },
    });

    const conflicts: Array<{
      classId: string;
      startsAt: string;
      type: "room" | "coach";
      otherClassName: string;
    }> = [];
    for (const u of updates) {
      for (const o of others) {
        const overlaps = o.startsAt < u.endsAt && o.endsAt > u.startsAt;
        if (!overlaps) continue;
        if (o.roomId === u.roomId) {
          conflicts.push({
            classId: u.id,
            startsAt: u.startsAt.toISOString(),
            type: "room",
            otherClassName: `${o.classType.name} · ${o.room.name}`,
          });
        }
        if (o.coachId === u.coachId) {
          conflicts.push({
            classId: u.id,
            startsAt: u.startsAt.toISOString(),
            type: "coach",
            otherClassName: o.classType.name,
          });
        }
      }
    }

    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Schedule conflicts", conflicts },
        { status: 409 },
      );
    }

    // Apply: per-class update because each row gets a different startsAt/endsAt.
    let count = 0;
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.class.update({
          where: { id: u.id },
          data: { ...data, startsAt: u.startsAt, endsAt: u.endsAt },
        });
        count++;
      }
    });

    return NextResponse.json({ count });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("PUT /api/classes/series/[recurringId] error:", error);
    return NextResponse.json({ error: "Failed to update series" }, { status: 500 });
  }
}

/**
 * DELETE /api/classes/series/[recurringId]
 * Cancel all future classes in a recurring series.
 * Query params:
 *   futureOnly=true (default) - only cancel classes that haven't started yet
 *   futureOnly=false - cancel all classes in series
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ recurringId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { recurringId } = await params;
    const futureOnly = request.nextUrl.searchParams.get("futureOnly") !== "false";

    const where: Record<string, unknown> = {
      recurringId,
      tenantId: ctx.tenant.id,
      status: "SCHEDULED",
    };
    if (futureOnly) {
      where.startsAt = { gt: new Date() };
    }

    // Get the classes first to handle waitlist refunds
    const classesToCancel = await prisma.class.findMany({
      where,
      select: { id: true },
    });

    if (classesToCancel.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // Cancel each class with full refund + email flow
    let totalRefunded = 0;
    for (const cls of classesToCancel) {
      const refunded = await cancelClassWithRefunds(cls.id, ctx.tenant.id);
      totalRefunded += refunded;
    }

    return NextResponse.json({ count: classesToCancel.length, refundedBookings: totalRefunded });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("DELETE /api/classes/series/[recurringId] error:", error);
    return NextResponse.json({ error: "Failed to cancel series" }, { status: 500 });
  }
}
