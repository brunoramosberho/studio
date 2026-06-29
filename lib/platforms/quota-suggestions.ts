// Detects classes where the Wellhub quota is the bottleneck: Wellhub is full
// (or nearly) yet the room still has physical seats free. Raising the quota
// there captures Wellhub revenue that's currently being turned away.
//
// Also flags the inverse (class full of direct members, Wellhub quota idle) as
// a lower-priority "consider lowering" hint.
//
// Pure-ish: one query, no side effects. Used by the dashboard suggestions
// endpoint, the action-items badge, and the Spark brief.

import { prisma } from "@/lib/db";
import {
  MAGIC_CONSUMING_STATUSES,
  PLATFORM_CONSUMING_STATUSES,
} from "@/lib/booking/availability";

export type QuotaSuggestionType = "raise" | "lower";

export interface QuotaSuggestion {
  classId: string;
  className: string;
  startsAt: string;
  type: QuotaSuggestionType;
  /** Current Wellhub quota for the class. */
  currentQuota: number;
  /** Suggested new quota. */
  suggestedQuota: number;
  roomCapacity: number;
  wellhubBooked: number;
  /** Physical seats free right now (shared across all channels). */
  physicalSeatsLeft: number;
  reason: string;
}

const DEFAULT_LOOKAHEAD_DAYS = 3; // today + next 2 days

/**
 * Scan upcoming classes (today + next N-1 days) and return quota suggestions.
 * Only considers Wellhub-synced, product-mapped classes that aren't closed.
 */
export async function getQuotaSuggestions(
  tenantId: string,
  opts: { lookaheadDays?: number; now?: Date } = {},
): Promise<QuotaSuggestion[]> {
  const lookaheadDays = opts.lookaheadDays ?? DEFAULT_LOOKAHEAD_DAYS;
  const now = opts.now ?? new Date();
  const horizon = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

  const quotas = await prisma.schedulePlatformQuota.findMany({
    where: {
      tenantId,
      platform: "wellhub",
      isClosedManually: false,
      class: {
        status: "SCHEDULED",
        startsAt: { gte: now, lte: horizon },
        wellhubSlotId: { not: null },
      },
    },
    select: {
      classId: true,
      quotaSpots: true,
      bookedSpots: true,
      class: {
        select: {
          startsAt: true,
          classType: { select: { name: true } },
          room: { select: { maxCapacity: true } },
          _count: {
            select: {
              bookings: { where: { status: { in: [...MAGIC_CONSUMING_STATUSES] } } },
              blockedSpots: true,
            },
          },
        },
      },
    },
  });

  const classIds = quotas.map((q) => q.classId);
  // Platform-occupied seats per class (companions are already in bookings, so
  // count only platform rows without a companion to avoid double-counting).
  const platformCounts = classIds.length
    ? await prisma.platformBooking.groupBy({
        by: ["classId"],
        where: {
          classId: { in: classIds },
          status: { in: PLATFORM_CONSUMING_STATUSES },
          companionBooking: { is: null },
        },
        _count: true,
      })
    : [];
  const platformByClass = new Map(platformCounts.map((p) => [p.classId, p._count]));

  const suggestions: QuotaSuggestion[] = [];

  for (const q of quotas) {
    const cls = q.class;
    const capacity = cls.room?.maxCapacity ?? 0;
    if (capacity <= 0) continue;

    const physicalLeft =
      capacity -
      cls._count.bookings -
      cls._count.blockedSpots -
      (platformByClass.get(q.classId) ?? 0);

    const wellhubFull = q.quotaSpots > 0 && q.bookedSpots >= q.quotaSpots;

    // RAISE: Wellhub is at its cap but the room still has seats. Suggest adding
    // up to the free seats, capped so direct members keep a reasonable share.
    if (wellhubFull && physicalLeft > 0) {
      const headroom = Math.min(physicalLeft, Math.max(1, Math.ceil(capacity * 0.2)));
      const suggested = q.quotaSpots + headroom;
      suggestions.push({
        classId: q.classId,
        className: cls.classType.name,
        startsAt: cls.startsAt.toISOString(),
        type: "raise",
        currentQuota: q.quotaSpots,
        suggestedQuota: suggested,
        roomCapacity: capacity,
        wellhubBooked: q.bookedSpots,
        physicalSeatsLeft: physicalLeft,
        reason: `Wellhub lleno (${q.bookedSpots}/${q.quotaSpots}) pero quedan ${physicalLeft} lugares libres. Sube el cupo para captar más reservas de Wellhub.`,
      });
      continue;
    }

    // LOWER: the room is essentially full of direct members while Wellhub has
    // unused quota — those reserved seats won't be sold to Wellhub anyway.
    if (physicalLeft <= 0 && q.bookedSpots < q.quotaSpots && q.quotaSpots > 0) {
      suggestions.push({
        classId: q.classId,
        className: cls.classType.name,
        startsAt: cls.startsAt.toISOString(),
        type: "lower",
        currentQuota: q.quotaSpots,
        suggestedQuota: Math.max(q.bookedSpots, 0),
        roomCapacity: capacity,
        wellhubBooked: q.bookedSpots,
        physicalSeatsLeft: 0,
        reason: `La clase está llena con miembros directos y Wellhub tiene ${q.quotaSpots - q.bookedSpots} cupo(s) sin usar. Puedes bajar el cupo de Wellhub aquí.`,
      });
    }
  }

  // Raise suggestions first (revenue opportunity), then by soonest class.
  return suggestions.sort((a, b) => {
    if (a.type !== b.type) return a.type === "raise" ? -1 : 1;
    return a.startsAt.localeCompare(b.startsAt);
  });
}
