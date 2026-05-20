import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/**
 * GET /api/classes/series/[recurringId]/edit-check
 * Query params: scope=all|from, fromId=<classId> (when scope=from)
 *
 * Reports whether a bulk time/duration edit is safe — i.e. no live
 * reservations would be silently moved. The PUT endpoint re-validates this
 * before applying any change, so this is purely a UX aid.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recurringId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { recurringId } = await params;
    const scope = request.nextUrl.searchParams.get("scope") ?? "all";
    const fromId = request.nextUrl.searchParams.get("fromId");

    const startsAtFilter: { gt: Date; gte?: Date } = { gt: new Date() };
    if (scope === "from" && fromId) {
      const fromClass = await prisma.class.findFirst({
        where: { id: fromId, recurringId, tenantId: ctx.tenant.id },
        select: { startsAt: true },
      });
      if (fromClass) startsAtFilter.gte = fromClass.startsAt;
    }

    const affected = await prisma.class.findMany({
      where: {
        recurringId,
        tenantId: ctx.tenant.id,
        status: "SCHEDULED",
        startsAt: startsAtFilter,
      },
      select: { id: true },
    });

    if (affected.length === 0) {
      return NextResponse.json({
        affectedClasses: 0,
        bookings: 0,
        waitlist: 0,
        platformBookings: 0,
        canEditTime: true,
      });
    }

    const classIds = affected.map((c) => c.id);

    const [bookings, waitlist, platformBookings] = await Promise.all([
      prisma.booking.count({
        where: {
          tenantId: ctx.tenant.id,
          classId: { in: classIds },
          status: { in: ["CONFIRMED", "ATTENDED"] },
        },
      }),
      prisma.waitlist.count({
        where: { classId: { in: classIds } },
      }),
      prisma.platformBooking.count({
        where: {
          tenantId: ctx.tenant.id,
          classId: { in: classIds },
          status: { notIn: ["cancelled", "absent", "rejected"] },
        },
      }),
    ]);

    return NextResponse.json({
      affectedClasses: affected.length,
      bookings,
      waitlist,
      platformBookings,
      canEditTime: bookings === 0 && waitlist === 0 && platformBookings === 0,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/classes/series/[recurringId]/edit-check error:", error);
    return NextResponse.json({ error: "Failed to check series" }, { status: 500 });
  }
}
