import { prisma } from "@/lib/db";
import { sendPushToUser, sendPushToMany } from "@/lib/push";
import { sendWaitlistPromotion, sendSpotAvailable, getTenantBaseUrl } from "@/lib/email";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { shouldHideCoach } from "@/lib/coach";

/**
 * Refund the credit held by a waitlist entry back to the user's package.
 */
export async function refundWaitlistEntry(entry: {
  id: string;
  packageUsed: string | null;
}) {
  if (!entry.packageUsed) return;

  await prisma.userPackage.update({
    where: { id: entry.packageUsed },
    data: { creditsUsed: { decrement: 1 } },
  });
}

/**
 * Re-number waitlist positions for a class so they are contiguous starting at 1.
 */
export async function reorderWaitlistPositions(
  classId: string,
  tenantId: string,
) {
  const remaining = await prisma.waitlist.findMany({
    where: { classId, tenantId },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  await Promise.all(
    remaining.map((entry, idx) =>
      prisma.waitlist.update({
        where: { id: entry.id },
        data: { position: idx + 1 },
      }),
    ),
  );
}

/**
 * Promote the first person on the waitlist for a class into a confirmed booking.
 * Handles: create booking, delete waitlist entry, reorder, send email + push.
 * Returns the created booking or null if the waitlist is empty.
 */
export async function promoteFromWaitlist(classId: string, tenantId: string) {
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      room: { select: { maxCapacity: true } },
      _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
    },
  });

  if (!classData) return null;

  const spotsLeft = classData.room.maxCapacity - classData._count.bookings;
  if (spotsLeft <= 0) return null;

  const first = await prisma.waitlist.findFirst({
    where: { classId, tenantId },
    orderBy: { position: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      class: {
        include: {
          classType: true,
          coach: { select: { name: true } },
          room: {
            include: {
              studio: {
                include: { city: { select: { timezone: true } } },
              },
            },
          },
        },
      },
    },
  });

  const tenantHide = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { hideCoachUntilClassEnds: true },
  });

  if (!first) return null;

  const booking = await prisma.booking.create({
    data: {
      tenantId,
      classId,
      userId: first.userId,
      status: "CONFIRMED",
      packageUsed: first.packageUsed,
    },
  });

  if (first.packageUsed) {
    await recognizeBookingSafe({
      userPackageId: first.packageUsed,
      bookingId: booking.id,
      classId,
      scheduledAt: first.class.startsAt,
      scope: "waitlist.promote",
    });
  }

  await prisma.waitlist.delete({ where: { id: first.id } });
  await reorderWaitlistPositions(classId, tenantId);

  const userName = first.user.name ?? "Cliente";
  const cls = first.class;

  sendPushToUser(first.userId, {
    title: "¡Entraste a la clase!",
    body: `Se liberó un lugar en ${cls.classType.name} y ya tienes tu reserva.`,
    url: `/class/${classId}`,
    tag: `waitlist-promoted-${classId}`,
  }, tenantId).catch(() => {});

  if (first.user.email) {
    const hideCoach = shouldHideCoach(tenantHide, { endsAt: cls.endsAt });
    sendWaitlistPromotion({
      to: first.user.email,
      name: userName,
      className: cls.classType.name,
      coachName: hideCoach ? null : cls.coach.name,
      date: cls.startsAt,
      startTime: cls.startsAt,
      location: cls.room?.studio?.name ?? undefined,
      timezone: cls.room?.studio?.city?.timezone,
    }).catch(() => {});
  }

  prisma.notification
    .create({
      data: {
        tenantId,
        userId: first.userId,
        type: "WAITLIST_PROMOTED",
      },
    })
    .catch(() => {});

  return booking;
}

/**
 * Refund credits and delete all remaining waitlist entries for a class.
 * Used when a class starts or is cancelled with people still waiting.
 */
export async function refundAndClearWaitlist(
  classId: string,
  tenantId: string,
) {
  const entries = await prisma.waitlist.findMany({
    where: { classId, tenantId },
    select: { id: true, packageUsed: true, userId: true },
  });

  for (const entry of entries) {
    await refundWaitlistEntry(entry);
  }

  if (entries.length > 0) {
    await prisma.waitlist.deleteMany({ where: { classId, tenantId } });
  }

  await clearSpotNotifyMe(classId, tenantId);

  return entries.length;
}

/**
 * Notify all "notify me" subscribers that a spot opened up.
 * Sends push + email + in-app notification to each subscriber.
 * Called after a booking cancellation when spots become available.
 */
export async function notifySpotWatchers(classId: string, tenantId: string) {
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      room: {
        select: {
          maxCapacity: true,
          studio: {
            include: { city: { select: { timezone: true } } },
          },
        },
      },
      _count: {
        select: {
          bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
          blockedSpots: true,
        },
      },
      classType: true,
      coach: { select: { name: true } },
    },
  });

  if (!classData) return;

  const spotsLeft =
    classData.room.maxCapacity -
    classData._count.bookings -
    classData._count.blockedSpots;

  if (spotsLeft <= 0) return;

  const watchers = await prisma.classNotifyMe.findMany({
    where: { classId, tenantId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (watchers.length === 0) return;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, hideCoachUntilClassEnds: true },
  });

  const baseUrl = tenant ? getTenantBaseUrl(tenant.slug) : "";
  const hideCoach = shouldHideCoach(tenant, { endsAt: classData.endsAt });
  const classUrl = `${baseUrl}/class/${classId}`;
  const timezone = classData.room.studio?.city?.timezone;
  const location = classData.room.studio?.name ?? undefined;

  for (const watcher of watchers) {
    sendPushToUser(
      watcher.userId,
      {
        title: "¡Se abrió un lugar!",
        body: `Hay espacio en ${classData.classType.name}. ¡Resérvalo antes que alguien más!`,
        url: `/class/${classId}`,
        tag: `spot-available-${classId}`,
      },
      tenantId,
    ).catch(() => {});

    if (watcher.user.email) {
      sendSpotAvailable({
        to: watcher.user.email,
        name: watcher.user.name ?? "Hola",
        className: classData.classType.name,
        coachName: hideCoach ? null : classData.coach.name,
        date: classData.startsAt,
        startTime: classData.startsAt,
        location,
        timezone,
        classUrl,
      }).catch(() => {});
    }

    prisma.notification
      .create({
        data: {
          tenantId,
          userId: watcher.userId,
          type: "SPOT_AVAILABLE",
        },
      })
      .catch(() => {});
  }
}

/**
 * Delete all "notify me" entries for a class.
 * Used when a class is cancelled, completed, or starts.
 */
export async function clearSpotNotifyMe(classId: string, tenantId: string) {
  await prisma.classNotifyMe.deleteMany({ where: { classId, tenantId } });
}

/**
 * Remove a user's "notify me" entry when they book or join the waitlist.
 */
export async function removeSpotNotifyMe(classId: string, userId: string) {
  await prisma.classNotifyMe
    .delete({ where: { classId_userId: { classId, userId } } })
    .catch(() => {});
}
