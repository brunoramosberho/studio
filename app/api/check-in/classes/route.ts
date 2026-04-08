import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const { searchParams } = request.nextUrl;
    const dateStr = searchParams.get("date");

    const date = dateStr ? new Date(dateStr) : new Date();
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const now = new Date();

    const classes = await prisma.class.findMany({
      where: {
        tenantId: ctx.tenant.id,
        status: { in: ["SCHEDULED", "COMPLETED"] },
        startsAt: { gte: dayStart, lte: dayEnd },
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
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            waitlist: true,
            checkIns: true,
          },
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
      coachName: c.coach.name,
      coachImage: c.coach.photoUrl || c.coach.user?.image,
      room: c.room.name,
      studioId: c.room.studio.id,
      studioName: c.room.studio.name,
      capacity: c.room.maxCapacity,
      enrolledCount: c._count.bookings,
      checkedInCount: c._count.checkIns,
      waitlistCount: c._count.waitlist,
      isLive: now >= c.startsAt && now <= c.endsAt,
      isFinished: now > c.endsAt,
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
