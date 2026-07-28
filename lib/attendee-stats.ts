import { prisma } from "@/lib/db";

/**
 * Per-member history counts behind the roster tags ("N classes",
 * "Top client", "First with instructor", "% cancels") shown on the admin
 * class page and the check-in roster.
 *
 * Rules (same finished-classes-only convention as occupancy):
 *  - "taken" counts bookings CONFIRMED/ATTENDED whose class already ENDED
 *    and wasn't cancelled — future reservations and the class being viewed
 *    never inflate the number. "12 classes" means classes actually taken.
 *  - Everything is tenant-scoped: a member of two studios must not leak one
 *    studio's history into the other's roster.
 *  - Cancel rate = cancels+no-shows over RESOLVED bookings (taken + cancels),
 *    so future reservations can't dilute it.
 */

export interface AttendeeCounts {
  /** Finished classes actually taken in this tenant (excludes this class). */
  taken: number;
  /** Of those, taken with this class's coach. */
  takenWithCoach: number;
  /** Lifetime cancels + no-shows in this tenant. */
  cancelled: number;
}

const TAKEN_STATUSES = ["ATTENDED", "CONFIRMED"] as ("ATTENDED" | "CONFIRMED")[];
const CANCEL_STATUSES = ["CANCELLED", "NO_SHOW"] as ("CANCELLED" | "NO_SHOW")[];

/** A member needs this many resolved bookings before we show a cancel rate. */
export const MIN_RESOLVED_FOR_CANCEL_RATE = 10;

export function cancelRateFor(counts: AttendeeCounts): number | null {
  const resolved = counts.taken + counts.cancelled;
  if (resolved < MIN_RESOLVED_FOR_CANCEL_RATE) return null;
  return Math.round((counts.cancelled / resolved) * 100);
}

export async function getAttendeeStats(args: {
  tenantId: string;
  userIds: string[];
  coachId: string;
  /** The class whose roster is being rendered — its own bookings don't count. */
  excludeClassId: string;
}): Promise<Map<string, AttendeeCounts>> {
  const out = new Map<string, AttendeeCounts>();
  const userIds = [...new Set(args.userIds)];
  for (const id of userIds) out.set(id, { taken: 0, takenWithCoach: 0, cancelled: 0 });
  if (userIds.length === 0) return out;

  const now = new Date();
  const takenBase = {
    tenantId: args.tenantId,
    userId: { in: userIds },
    classId: { not: args.excludeClassId },
    status: { in: TAKEN_STATUSES },
  };
  const finishedClass = { endsAt: { lte: now }, status: { not: "CANCELLED" as const } };

  const [taken, withCoach, cancels] = await Promise.all([
    prisma.booking.groupBy({
      by: ["userId"],
      where: { ...takenBase, class: finishedClass },
      _count: true,
    }),
    prisma.booking.groupBy({
      by: ["userId"],
      where: { ...takenBase, class: { ...finishedClass, coachId: args.coachId } },
      _count: true,
    }),
    prisma.booking.groupBy({
      by: ["userId"],
      where: {
        tenantId: args.tenantId,
        userId: { in: userIds },
        classId: { not: args.excludeClassId },
        status: { in: CANCEL_STATUSES },
      },
      _count: true,
    }),
  ]);

  for (const r of taken) if (r.userId) out.get(r.userId)!.taken = r._count;
  for (const r of withCoach) if (r.userId) out.get(r.userId)!.takenWithCoach = r._count;
  for (const r of cancels) if (r.userId) out.get(r.userId)!.cancelled = r._count;
  return out;
}
