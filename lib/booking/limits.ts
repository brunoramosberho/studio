import { prisma } from "@/lib/db";
import { formatDateInZone } from "@/lib/utils";

export type BookingLimitFailure =
  | { ok: false; reason: "DAY"; current: number; max: number }
  | { ok: false; reason: "CONCURRENT"; current: number; max: number };

export type BookingLimitResult = { ok: true } | BookingLimitFailure;

interface CheckArgs {
  userPackageId: string;
  userId: string;
  tenantId: string;
  classStartsAt: Date;
  studioTimezone: string;
  maxBookingsPerDay: number | null;
  maxConcurrentUpcomingBookings: number | null;
}

/**
 * Enforce per-Package booking-rate caps when consuming a subscription/pack.
 * Counts only the main booking row (parentBookingId IS NULL) — guests belong
 * to the host's count, not the subscription holder's.
 *
 * DAY count: any non-cancelled booking on this UserPackage whose class falls
 * on the same calendar day in studio TZ.
 * CONCURRENT count: CONFIRMED bookings on this UserPackage whose class is in
 * the future. Waitlist rows live in a separate table so they never count —
 * that's intentional (a member queueing on multiple waitlists hoping one
 * frees up shouldn't be penalised).
 */
export async function checkSubscriptionBookingLimits(
  args: CheckArgs,
): Promise<BookingLimitResult> {
  const { maxBookingsPerDay, maxConcurrentUpcomingBookings } = args;

  if (maxBookingsPerDay == null && maxConcurrentUpcomingBookings == null) {
    return { ok: true };
  }

  if (maxBookingsPerDay != null) {
    const targetDay = formatDateInZone(args.classStartsAt, args.studioTimezone);
    const sameDayCandidates = await prisma.booking.findMany({
      where: {
        tenantId: args.tenantId,
        userId: args.userId,
        parentBookingId: null,
        packageUsed: args.userPackageId,
        status: { in: ["CONFIRMED", "ATTENDED", "NO_SHOW"] },
      },
      select: { class: { select: { startsAt: true } } },
    });
    const sameDayCount = sameDayCandidates.filter(
      (b) => formatDateInZone(b.class.startsAt, args.studioTimezone) === targetDay,
    ).length;
    if (sameDayCount >= maxBookingsPerDay) {
      return {
        ok: false,
        reason: "DAY",
        current: sameDayCount,
        max: maxBookingsPerDay,
      };
    }
  }

  if (maxConcurrentUpcomingBookings != null) {
    const upcomingCount = await prisma.booking.count({
      where: {
        tenantId: args.tenantId,
        userId: args.userId,
        parentBookingId: null,
        packageUsed: args.userPackageId,
        status: "CONFIRMED",
        class: { startsAt: { gt: new Date() } },
      },
    });
    if (upcomingCount >= maxConcurrentUpcomingBookings) {
      return {
        ok: false,
        reason: "CONCURRENT",
        current: upcomingCount,
        max: maxConcurrentUpcomingBookings,
      };
    }
  }

  return { ok: true };
}
