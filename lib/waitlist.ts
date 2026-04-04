import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import { sendWaitlistPromotion } from "@/lib/email";

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
          coach: { include: { user: { select: { name: true } } } },
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

  await prisma.waitlist.delete({ where: { id: first.id } });
  await reorderWaitlistPositions(classId, tenantId);

  const userName = first.user.name ?? "Cliente";
  const cls = first.class;

  sendPushToUser(first.userId, {
    title: "¡Entraste a la clase!",
    body: `Se liberó un lugar en ${cls.classType.name} y ya tienes tu reserva.`,
    url: `/class/${classId}`,
    tag: `waitlist-promoted-${classId}`,
  }).catch(() => {});

  if (first.user.email) {
    sendWaitlistPromotion({
      to: first.user.email,
      name: userName,
      className: cls.classType.name,
      coachName: cls.coach.user.name ?? "Coach",
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

  return entries.length;
}
