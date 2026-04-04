import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import { refundAndClearWaitlist } from "@/lib/waitlist";
import { checkAchievements, createGroupedAchievementEvents } from "@/lib/achievements";
import { formatTime } from "@/lib/utils";

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
        user: { select: { city: { select: { timezone: true } } } },
        class: {
          include: {
            classType: { select: { name: true } },
            coach: { select: { user: { select: { name: true } } } },
            room: { select: { studio: { select: { city: { select: { timezone: true } } } } } },
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
      const tz = booking.user?.city?.timezone || cls.room?.studio?.city?.timezone || "America/Mexico_City";

      const timeStr = formatTime(cls.startsAt, tz);

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

  // Refund credits for waitlist entries on classes that have already started
  let waitlistRefunded = 0;
  for (const tenant of tenants) {
    const staleWaitlists = await prisma.waitlist.findMany({
      where: {
        tenantId: tenant.id,
        class: {
          OR: [
            { startsAt: { lte: now } },
            { status: { in: ["CANCELLED", "COMPLETED"] } },
          ],
        },
      },
      select: { classId: true },
      distinct: ["classId"],
    });

    for (const { classId } of staleWaitlists) {
      waitlistRefunded += await refundAndClearWaitlist(classId, tenant.id);
    }
  }

  // Birthday achievements — check users whose birthday is today
  let birthdayChecked = 0;
  for (const tenant of tenants) {
    const todayMonth = now.getUTCMonth() + 1;
    const todayDay = now.getUTCDate();

    const birthdayUsers = await prisma.user.findMany({
      where: {
        birthday: { not: null },
        memberships: { some: { tenantId: tenant.id } },
      },
      select: { id: true, birthday: true },
    });

    for (const u of birthdayUsers) {
      if (!u.birthday) continue;
      if (
        u.birthday.getUTCMonth() + 1 === todayMonth &&
        u.birthday.getUTCDate() === todayDay
      ) {
        const grants = await checkAchievements(u.id, tenant.id);
        if (grants.length > 0) {
          await createGroupedAchievementEvents(grants, tenant.id);
        }
        birthdayChecked++;
      }
    }
  }

  // Streak reset — members who didn't attend yesterday lose their streak
  let streaksReset = 0;
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  for (const tenant of tenants) {
    const activeStreaks = await prisma.memberProgress.findMany({
      where: { tenantId: tenant.id, currentStreak: { gt: 0 } },
      select: { userId: true, lastClassDate: true },
    });

    for (const mp of activeStreaks) {
      if (!mp.lastClassDate) {
        await prisma.memberProgress.update({
          where: { userId_tenantId: { userId: mp.userId, tenantId: tenant.id } },
          data: { currentStreak: 0 },
        });
        streaksReset++;
        continue;
      }
      const lastStr = mp.lastClassDate.toISOString().slice(0, 10);
      if (lastStr !== todayStr && lastStr !== yesterdayStr) {
        await prisma.memberProgress.update({
          where: { userId_tenantId: { userId: mp.userId, tenantId: tenant.id } },
          data: { currentStreak: 0 },
        });
        streaksReset++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    waitlistRefunded,
    birthdayChecked,
    streaksReset,
  });
}
