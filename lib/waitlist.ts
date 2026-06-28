import { prisma } from "@/lib/db";
import { sendPushToUser, sendPushToMany } from "@/lib/push";
import { sendWaitlistPromotion, sendSpotAvailable, getTenantBaseUrl } from "@/lib/email";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { shouldHideCoach } from "@/lib/coach";
import { platformBookedNoCompanionWhere } from "@/lib/booking/availability";

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

export interface PromoteOptions {
  /** Promote this specific waitlist entry instead of the first by position. */
  waitlistEntryId?: string;
  /** Promote the entry held by this member (alternative selector). */
  memberId?: string;
  /**
   * Mark the promoted booking ATTENDED + create a CheckIn in one step. Used at
   * the front desk when the person is physically present (e.g. someone from the
   * waitlist already at the studio), so they don't need a second check-in tap.
   */
  markAttended?: boolean;
  /** Staff user id recorded on the CheckIn when markAttended is set. */
  checkedInBy?: string;
  /** Bypass the capacity guard (staff override for a full room). */
  force?: boolean;
  /**
   * Send the "you got a spot" push/email. Defaults to false when markAttended
   * (the person is already here) and true otherwise.
   */
  notify?: boolean;
}

/**
 * Promote someone on the waitlist for a class into a booking. By default takes
 * the first by position and creates a CONFIRMED booking, reusing the credit the
 * waitlist entry already holds (no double charge), deleting the entry, and
 * notifying them. Options allow promoting a specific person and/or marking them
 * attended on the spot (front-desk use). Returns the booking, or null if there
 * is no matching entry or the room is full (and not forced).
 */
export async function promoteFromWaitlist(
  classId: string,
  tenantId: string,
  options: PromoteOptions = {},
) {
  const { waitlistEntryId, memberId, markAttended = false, checkedInBy, force = false } = options;
  const shouldNotify = options.notify ?? !markAttended;
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      room: { select: { maxCapacity: true, layout: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
          blockedSpots: true,
        },
      },
    },
  });

  if (!classData) return null;

  // Count platform (Wellhub/ClassPass) seats too — they occupy the same room.
  // Without this we would promote a member into a physically full class.
  // Exclude rows with a companion Booking — those are already in the Booking
  // count above, so counting them here would double-subtract the seat.
  const platformBooked = await prisma.platformBooking.count({
    where: platformBookedNoCompanionWhere(classId),
  });

  const spotsLeft =
    classData.room.maxCapacity -
    classData._count.bookings -
    classData._count.blockedSpots -
    platformBooked;
  if (spotsLeft <= 0 && !force) return null;

  const first = await prisma.waitlist.findFirst({
    where: waitlistEntryId
      ? { id: waitlistEntryId, classId, tenantId }
      : memberId
        ? { classId, tenantId, userId: memberId }
        : { classId, tenantId },
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

  // Assign the lowest free spot so the promoted member shows on the room map.
  // Without this they hold a seat with no spot, so a full class looks like it
  // has gaps. Only rooms with a configured spot layout use spot numbers.
  let assignedSpot: number | null = null;
  const layout = classData.room.layout as { spots?: unknown[] } | null;
  if (layout?.spots?.length) {
    const [takenRows, blockedRows] = await Promise.all([
      prisma.booking.findMany({
        where: {
          classId,
          tenantId,
          spotNumber: { not: null },
          status: { in: ["CONFIRMED", "ATTENDED"] },
        },
        select: { spotNumber: true },
      }),
      prisma.blockedSpot.findMany({ where: { classId }, select: { spotNumber: true } }),
    ]);
    const used = new Set<number>();
    for (const r of takenRows) if (r.spotNumber != null) used.add(r.spotNumber);
    for (const r of blockedRows) if (r.spotNumber != null) used.add(r.spotNumber);
    for (let s = 1; s <= classData.room.maxCapacity; s++) {
      if (!used.has(s)) {
        assignedSpot = s;
        break;
      }
    }
  }

  const baseBookingData = {
    tenantId,
    classId,
    userId: first.userId,
    status: markAttended ? ("ATTENDED" as const) : ("CONFIRMED" as const),
    packageUsed: first.packageUsed,
  };
  const booking = await prisma.booking
    .create({ data: { ...baseBookingData, spotNumber: assignedSpot } })
    .catch((e: unknown) => {
      // A concurrent promotion grabbed the spot → fall back to no spot rather
      // than failing the promotion (unique on [classId, spotNumber]).
      if (assignedSpot != null && (e as { code?: string })?.code === "P2002") {
        return prisma.booking.create({ data: { ...baseBookingData, spotNumber: null } });
      }
      throw e;
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

  // Front-desk promotion of someone already present: record attendance now so
  // they appear checked-in on the roster without a second tap.
  if (markAttended) {
    await prisma.checkIn
      .upsert({
        where: { classId_memberId: { classId, memberId: first.userId } },
        create: {
          tenantId,
          classId,
          memberId: first.userId,
          checkedInBy: checkedInBy ?? first.userId,
          method: "manual",
          status: new Date() > first.class.startsAt ? "late" : "present",
        },
        update: {},
      })
      .catch((err) => console.error("Promote→CheckIn sync failed:", err));

    import("@/lib/referrals/lifecycle")
      .then(({ updateLifecycle }) => updateLifecycle(first.userId, tenantId, "attended"))
      .catch((err) => console.error("Promote lifecycle update failed:", err));
  }

  const userName = first.user.name ?? "Cliente";
  const cls = first.class;

  // Skip the "you got a spot" notifications when the person is already at the
  // desk (markAttended) — they don't need to be told they got in.
  if (shouldNotify) {
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
  }

  return booking;
}

/**
 * Promote as many waitlisted members as there are free physical seats.
 * Used when several seats free at once (e.g. the Wellhub reconciliation cron
 * detects multiple dropped cancellations). Returns the number promoted.
 *
 * promoteFromWaitlist already re-checks capacity on each call and returns null
 * when the room is full or the waitlist is empty, so this loop terminates.
 */
export async function promoteWaitlistToCapacity(
  classId: string,
  tenantId: string,
  maxPromotions = 50,
): Promise<number> {
  let promoted = 0;
  for (let i = 0; i < maxPromotions; i++) {
    const booking = await promoteFromWaitlist(classId, tenantId);
    if (!booking) break;
    promoted++;
  }
  return promoted;
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

  const platformBooked = await prisma.platformBooking.count({
    where: platformBookedNoCompanionWhere(classId),
  });

  const spotsLeft =
    classData.room.maxCapacity -
    classData._count.bookings -
    classData._count.blockedSpots -
    platformBooked;

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
