import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  checkAchievements,
  createGroupedAchievementEvents,
  type GrantedAchievement,
} from "@/lib/achievements";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const role = (session?.user as Record<string, unknown>)?.role;
    if (!session?.user || (role !== "ADMIN" && role !== "COACH")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { attendedUserIds } = body as { attendedUserIds?: string[] };

    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        classType: true,
        coach: { include: { user: { select: { name: true } } } },
        bookings: {
          where: { status: "CONFIRMED" },
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const idsToMark =
      attendedUserIds ??
      cls.bookings.filter((b) => b.userId).map((b) => b.userId!);

    for (const booking of cls.bookings) {
      if (!booking.userId) continue;
      const attended = idsToMark.includes(booking.userId);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: attended ? "ATTENDED" : "NO_SHOW" },
      });
    }

    await prisma.class.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    const attendees = cls.bookings
      .filter((b) => b.userId && idsToMark.includes(b.userId))
      .map((b) => ({
        id: b.userId!,
        name: b.user?.name ?? "Miembro",
        image: b.user?.image ?? null,
      }));

    await prisma.feedEvent.create({
      data: {
        userId: cls.coach.userId,
        eventType: "CLASS_COMPLETED",
        visibility: "STUDIO_WIDE",
        payload: {
          classId: cls.id,
          className: cls.classType.name,
          coachName: cls.coach.user.name,
          date: format(cls.startsAt, "EEEE d 'de' MMMM", { locale: es }),
          time: format(cls.startsAt, "h:mm a"),
          duration: cls.classType.duration,
          attendees,
          attendeeCount: attendees.length,
        },
      },
    });

    const allGrants: GrantedAchievement[] = [];
    for (const userId of idsToMark) {
      const granted = await checkAchievements(userId);
      allGrants.push(...granted);
    }

    if (allGrants.length > 0) {
      await createGroupedAchievementEvents(allGrants);
    }

    return NextResponse.json({
      completed: true,
      attendeeCount: attendees.length,
      achievementsGranted: allGrants.length,
    });
  } catch (error) {
    console.error("POST /api/classes/[id]/complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete class" },
      { status: 500 },
    );
  }
}
