import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";
import { formatDateInZone, zonedWallTimeToUtc } from "@/lib/utils";

/**
 * UTC window covering the calendar day `day` ("yyyy-MM-dd") as lived in `tz`.
 * A studio's day is its own wall clock, not the server's: on Vercel the server
 * runs in UTC, so a plain `setHours(0,0,0,0)` window ends at 18:00 in Mexico
 * City and drops every evening class from the front desk's list.
 */
function dayWindowInZone(day: string, tz: string): { start: Date; end: Date } {
  const [year, month, date] = day.split("-").map(Number);
  const start = zonedWallTimeToUtc(year, month - 1, date, 0, 0, tz);
  // Date.UTC normalises the overflow, so this is the next calendar day even at
  // a month or year boundary.
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  const end = zonedWallTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth(),
    next.getUTCDate(),
    0,
    0,
    tz,
  );
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { searchParams } = request.nextUrl;
    const dateParam = searchParams.get("date");

    const fallbackTz = await resolveScheduleTimezone(ctx.tenant);

    // The requested day is a calendar date, not an instant — keep it as a plain
    // "yyyy-MM-dd" string and let each studio's timezone turn it into a window.
    const day = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "")
      ? (dateParam as string)
      : formatDateInZone(new Date(), fallbackTz);

    // Studios can sit in different timezones (and a tenant's "day" is really
    // one day per location), so group them by zone and query one window each.
    const studios = await prisma.studio.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, city: { select: { timezone: true } } },
    });
    if (studios.length === 0) return NextResponse.json([]);

    const tzByStudio = new Map(
      studios.map((s) => [s.id, s.city?.timezone || fallbackTz] as const),
    );
    const studioIdsByTz = new Map<string, string[]>();
    for (const [studioId, tz] of tzByStudio) {
      const bucket = studioIdsByTz.get(tz);
      if (bucket) bucket.push(studioId);
      else studioIdsByTz.set(tz, [studioId]);
    }

    const now = new Date();

    const classes = await prisma.class.findMany({
      where: {
        tenantId: ctx.tenant.id,
        status: { in: ["SCHEDULED", "COMPLETED"] },
        OR: [...studioIdsByTz].map(([tz, studioIds]) => {
          const { start, end } = dayWindowInZone(day, tz);
          return {
            room: { studioId: { in: studioIds } },
            startsAt: { gte: start, lt: end },
          };
        }),
      },
      include: {
        classType: { select: { id: true, name: true, color: true, icon: true } },
        coach: {
          select: { id: true, name: true, photoUrl: true, user: { select: { name: true, image: true } } },
        },
        room: {
          select: { id: true, name: true, maxCapacity: true, studio: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            // enrolled = every consuming seat (members + Wellhub companions).
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            waitlist: true,
            spotNotifyMe: true,
          },
        },
        // Present = bookings marked ATTENDED. This unifies member check-ins
        // (which set the booking ATTENDED) and Wellhub companions (whose
        // attendance is the ATTENDED status, not a CheckIn row). Counting
        // CheckIn rows undercounted Wellhub members → false "N no check-in".
        bookings: {
          where: { status: "ATTENDED" },
          select: { id: true },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    const result = classes.map((c) => ({
      id: c.id,
      className: c.classType.name,
      classColor: c.classType.color,
      classIcon: c.classType.icon,
      startTime: c.startsAt.toISOString(),
      endTime: c.endsAt.toISOString(),
      // The studio's zone, so the front desk reads its own wall clock no matter
      // where the browser (or an owner checking in from abroad) sits.
      timezone: tzByStudio.get(c.room.studio.id) ?? fallbackTz,
      coachName: c.coach.name,
      coachImage: c.coach.photoUrl || c.coach.user?.image,
      room: c.room.name,
      studioId: c.room.studio.id,
      studioName: c.room.studio.name,
      capacity: c.room.maxCapacity,
      enrolledCount: c._count.bookings,
      checkedInCount: c.bookings.length,
      waitlistCount: c._count.waitlist,
      notifyMeCount: c._count.spotNotifyMe,
      isLive: now >= c.startsAt && now <= c.endsAt,
      isFinished: now > c.endsAt,
      // Finished but still within the late-registration window — front desk can
      // still register a missed attendee or mark a no-show for a short while
      // after the class ends.
      recentlyFinished:
        now > c.endsAt &&
        now.getTime() - c.endsAt.getTime() < 24 * 60 * 60 * 1000,
    }));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/check-in/classes error:", error);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}
