import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      userId: { not: null },
      class: {
        startsAt: { gte: windowStart, lte: windowEnd },
        status: "SCHEDULED",
      },
    },
    include: {
      class: {
        include: {
          classType: { select: { name: true } },
          coach: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  let sent = 0;

  for (const booking of bookings) {
    if (!booking.userId) continue;

    const cls = booking.class;
    const timeStr = format(cls.startsAt, "h:mm a", { locale: es });
    const className = cls.classType.name;
    const coachName = cls.coach.user.name?.split(" ")[0] ?? "tu coach";

    await sendPushToUser(booking.userId, {
      title: `${className} en 1 hora`,
      body: `Tu clase con ${coachName} es a las ${timeStr}`,
      url: "/my/bookings",
      tag: `reminder-${booking.classId}`,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { reminderSentAt: now },
    });

    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
