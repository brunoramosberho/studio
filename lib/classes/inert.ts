import { prisma } from "@/lib/db";

/**
 * A class is "inert" when nothing anywhere points at it: nobody booked, waited,
 * checked in, rated, requested a song, was penalised, or had money recognised
 * against it.
 *
 * Cancelling instead of deleting exists to protect that history. When there is
 * no history, the cancelled row is just a shell — and shells are what blocked
 * FDV from removing a discipline they had scheduled 377 classes under and then
 * emptied. The count guarding the delete saw the shells and refused.
 *
 * Deciding this is a data-loss question, so it is answered by enumerating every
 * table that references a class rather than by checking bookings and hoping.
 *
 * Do not be tempted to read the foreign keys instead: `Booking.class` is
 * declared `onDelete: Cascade`, as are ratings, check-ins and waitlist entries.
 * Those cascades exist so a delete leaves no orphans, not because the rows are
 * disposable — the database will happily take a member's booking history with
 * the class. This check is the only thing standing in the way, which is why it
 * refuses on any reference at all rather than trying to sort them into
 * important and unimportant.
 */

/**
 * Relations Class exposes, countable in one query.
 *
 * `swapRequests` matters as much as `substitutionRequests`: a substitution can
 * point at this class as the one being offered in exchange.
 */
const COUNTED_RELATIONS = [
  "bookings",
  "waitlist",
  "spotNotifyMe",
  "blockedSpots",
  "songRequests",
  "playlistTracks",
  "checkIns",
  "coachPenalties",
  "platformQuotas",
  "platformBookings",
  "ratings",
  "entitlements",
  "revenueEvents",
  "substitutionRequests",
  "swapRequests",
] as const;

/**
 * Tables that carry `classId` without a back-relation on Class, so `_count`
 * cannot see them. Counting only the named relations would silently delete a
 * class that still had, say, an open platform alert against it.
 *
 * Kept in sync with the schema by `inert.test.ts`, which fails when a new table
 * gains a classId and is not listed here.
 */
const UNRELATED_TABLES = ["challengePointEntry", "pendingPenalty", "platformAlert"] as const;

/** Every model the test expects to be covered, by Prisma model name. */
export const CLASS_REFERENCING_TABLES = [
  "Booking",
  "Waitlist",
  "ClassNotifyMe",
  "BlockedSpot",
  "ClassSongRequest",
  "ClassPlaylistTrack",
  "CheckIn",
  "CoachPenalty",
  "SchedulePlatformQuota",
  "PlatformBooking",
  "ClassRating",
  "Entitlement",
  "RevenueEvent",
  "SubstitutionRequest",
  "ChallengePointEntry",
  "PendingPenalty",
  "PlatformAlert",
] as const;

/**
 * Narrows `candidateIds` to the classes that carry no history at all.
 *
 * Grouped rather than per-class: removing a discipline can put hundreds of
 * candidates through here, and a query per class per table would be thousands
 * of round trips.
 */
export async function findInertClassIds(candidateIds: string[]): Promise<string[]> {
  if (candidateIds.length === 0) return [];

  const encumbered = new Set<string>();
  const mark = (rows: { classId: string | null }[]) => {
    for (const r of rows) if (r.classId) encumbered.add(r.classId);
  };

  const withCounts = await prisma.class.findMany({
    where: { id: { in: candidateIds } },
    select: {
      id: true,
      _count: { select: Object.fromEntries(COUNTED_RELATIONS.map((r) => [r, true])) as never },
    },
  });

  for (const cls of withCounts) {
    const counts = cls._count as unknown as Record<string, number>;
    if (Object.values(counts).some((n) => n > 0)) encumbered.add(cls.id);
  }

  await Promise.all(
    UNRELATED_TABLES.map(async (table) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (prisma as any)[table];
      mark(
        await model.findMany({
          where: { classId: { in: candidateIds } },
          select: { classId: true },
          distinct: ["classId"],
        }),
      );
    }),
  );

  return candidateIds.filter((id) => !encumbered.has(id));
}

/** Convenience for the single-class case. */
export async function classIsInert(classId: string): Promise<boolean> {
  return (await findInertClassIds([classId])).length === 1;
}

/**
 * Removes the empty shells among `candidateIds` and reports how many went.
 * Anything carrying history is left untouched, so a caller can treat a non-zero
 * remainder as "this really is still in use".
 */
export async function purgeInertClasses(candidateIds: string[]): Promise<number> {
  const inert = await findInertClassIds(candidateIds);
  if (inert.length === 0) return 0;
  const { count } = await prisma.class.deleteMany({ where: { id: { in: inert } } });
  return count;
}
