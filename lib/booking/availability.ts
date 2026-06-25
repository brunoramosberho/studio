// Single source of truth for "how many physical seats are left in a class".
//
// A class room has ONE physical capacity (`Room.maxCapacity`). Every seat is
// shared across all booking channels:
//   - Magic members        → Booking rows (CONFIRMED/ATTENDED)
//   - Admin-blocked seats   → BlockedSpot rows
//   - Platform members      → PlatformBooking rows (Wellhub/ClassPass) in a
//                             consuming status
//
// A Wellhub reservation also creates a seat-holding companion Booking, so it
// is ALREADY counted in the Booking total. To avoid double-counting, the
// `platformBooked` term counts only platform reservations WITHOUT a companion
// (ClassPass email bookings + any legacy Wellhub rows pre-companion).
//
// Availability = maxCapacity − confirmedBookings − blockedSpots − platformBookedNoCompanion
//
// This guarantees we never oversell the room and that a seat freed by ANY
// channel becomes immediately bookable by ANY channel. Platform `quotaSpots`
// is a *cap* on how many of the shared seats a given platform may take — it is
// NOT extra capacity on top of the room.

import type { PlatformBookingStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Platform booking statuses that physically occupy a seat. */
export const PLATFORM_CONSUMING_STATUSES: PlatformBookingStatus[] = [
  "confirmed",
  "checked_in",
  "pending_confirmation",
];

/**
 * Where-clause for platform bookings that occupy a seat but DON'T have a
 * companion Booking (so they aren't already in the Booking count). Use this
 * for the `platformBooked` term in availability math.
 */
export function platformBookedNoCompanionWhere(
  classId: string,
): Prisma.PlatformBookingWhereInput {
  return {
    classId,
    status: { in: PLATFORM_CONSUMING_STATUSES },
    companionBooking: { is: null },
  };
}

/** Magic booking statuses that physically occupy a seat. */
export const MAGIC_CONSUMING_STATUSES = ["CONFIRMED", "ATTENDED"] as const;

export interface ClassAvailability {
  maxCapacity: number;
  confirmedBookings: number;
  blockedSpots: number;
  platformBooked: number;
  /** maxCapacity − confirmedBookings − blockedSpots − platformBooked (can be <0 if already oversold). */
  spotsLeft: number;
}

/**
 * Compute live availability for a class, counting ALL channels.
 * Returns null if the class (or its room) doesn't exist.
 */
export async function getClassAvailability(
  classId: string,
): Promise<ClassAvailability | null> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      room: { select: { maxCapacity: true } },
      _count: {
        select: {
          bookings: { where: { status: { in: [...MAGIC_CONSUMING_STATUSES] } } },
          blockedSpots: true,
        },
      },
    },
  });
  if (!cls?.room) return null;

  const platformBooked = await prisma.platformBooking.count({
    where: platformBookedNoCompanionWhere(classId),
  });

  const maxCapacity = cls.room.maxCapacity;
  const confirmedBookings = cls._count.bookings;
  const blockedSpots = cls._count.blockedSpots;
  const spotsLeft = maxCapacity - confirmedBookings - blockedSpots - platformBooked;

  return { maxCapacity, confirmedBookings, blockedSpots, platformBooked, spotsLeft };
}

/**
 * Same computation as getClassAvailability but from already-loaded counts.
 * Use when you already have the numbers in hand (avoids an extra query).
 */
export function computeSpotsLeft(args: {
  maxCapacity: number;
  confirmedBookings: number;
  blockedSpots?: number;
  platformBooked?: number;
}): number {
  return (
    args.maxCapacity -
    args.confirmedBookings -
    (args.blockedSpots ?? 0) -
    (args.platformBooked ?? 0)
  );
}
