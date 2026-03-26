import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 75 * 60 * 1000);

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let sent = 0;

  for (const tenant of tenants) {
    const bookings = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        reminderSentAt: null,
        userId: { not: null },
        class: {
          tenantId: tenant.id,
          startsAt: { gt: now, lte: windowEnd },
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

    for (const booking of bookings) {
      if (!booking.userId) continue;

      const cls = booking.class;
      const minUntil = Math.round(
        (cls.startsAt.getTime() - now.getTime()) / 60_000,
      );
      const className = cls.classType.name;
      const coachName = cls.coach.user.name?.split(" ")[0] ?? "tu coach";

      const timeStr = cls.startsAt.toLocaleTimeString("es-MX", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Mexico_City",
      });

      const untilLabel =
        minUntil >= 60
          ? "en 1 hora"
          : `en ${minUntil} min`;

      await sendPushToUser(booking.userId, {
        title: `${className} ${untilLabel}`,
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
  }

  return NextResponse.json({ ok: true, sent });
}
