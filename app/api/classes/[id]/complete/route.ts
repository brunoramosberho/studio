import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  checkAchievements,
  createGroupedAchievementEvents,
  type GrantedAchievement,
} from "@/lib/achievements";
import { sendPushToMany } from "@/lib/push";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "COACH");

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { attendedUserIds } = body as { attendedUserIds?: string[] };

    const cls = await prisma.class.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      include: {
        classType: true,
        coach: { include: { user: { select: { name: true, image: true } } } },
        bookings: {
          where: { status: { not: "CANCELLED" } },
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const existingEvent = await prisma.feedEvent.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        eventType: "CLASS_COMPLETED",
        payload: { path: ["classId"], equals: id },
      },
      select: { id: true, payload: true },
    });

    if (cls.status === "COMPLETED" && existingEvent) {
      const payload = existingEvent.payload as Record<string, unknown>;
      return NextResponse.json({
        completed: true,
        feedEventId: existingEvent.id,
        attendeeCount: (payload.attendeeCount as number) ?? 0,
        achievementsGranted: 0,
        alreadyCompleted: true,
      });
    }

    const idsToMark =
      attendedUserIds ??
      cls.bookings.filter((b) => b.userId).map((b) => b.userId!);

    for (const booking of cls.bookings) {
      if (!booking.userId) continue;
      const attended = idsToMark.includes(booking.userId);
      const newStatus = attended ? "ATTENDED" : "NO_SHOW";
      if (booking.status !== newStatus) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { status: newStatus },
        });
      }
    }

    if (cls.status !== "COMPLETED") {
      await prisma.class.update({
        where: { id },
        data: { status: "COMPLETED" },
      });
    }

    const attendees = cls.bookings
      .filter((b) => b.userId && idsToMark.includes(b.userId))
      .map((b) => ({
        id: b.userId!,
        name: b.user?.name ?? "Miembro",
        image: b.user?.image ?? null,
      }));

    let feedEventId: string;

    if (existingEvent) {
      feedEventId = existingEvent.id;
    } else {
      const event = await prisma.feedEvent.create({
        data: {
          tenantId: ctx.tenant.id,
          userId: cls.coach.userId,
          eventType: "CLASS_COMPLETED",
          visibility: "STUDIO_WIDE",
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
      feedEventId = event.id;
    }

    const allGrants: GrantedAchievement[] = [];
    for (const userId of idsToMark) {
      const granted = await checkAchievements(userId, ctx.tenant.id);
      allGrants.push(...granted);
    }

    if (allGrants.length > 0) {
      await createGroupedAchievementEvents(allGrants, ctx.tenant.id);
    }

    if (!existingEvent) {
      const coachFirst = cls.coach.user.name?.split(" ")[0] ?? "Tu coach";
      sendPushToMany(
        idsToMark,
        {
          title: `${cls.classType.name} completada`,
          body: `${coachFirst} finalizó la clase. ¡Mira el post y comparte fotos!`,
          url: "/my",
          tag: `class-completed-${id}`,
        },
        ctx.tenant.id,
      );
    }

    return NextResponse.json({
      completed: true,
      feedEventId,
      attendeeCount: attendees.length,
      achievementsGranted: allGrants.length,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/classes/[id]/complete error:", error);
    return NextResponse.json(
      { error: "Failed to complete class" },
      { status: 500 },
    );
  }
}
