import { prisma } from "@/lib/db";
import { findInertClassIds } from "@/lib/classes/inert";

/**
 * Archived instructors: still in the data, no longer offered.
 *
 * An instructor who has taught can't be deleted — payroll, past rosters and
 * revenue all point at them. So removing one archives instead, and every
 * surface that *picks* an instructor has to leave them out while every surface
 * that *reports on the past* has to keep them in. Filtering everywhere would
 * quietly erase people from payroll; filtering nowhere puts an archived
 * instructor back in the class-creation picker.
 *
 * The split is enumerated below and enforced by `archive.test.ts`, because
 * there are sixteen query sites and remembering all of them is not a plan.
 */

/**
 * Spread into the `where` of any query that offers an instructor to be chosen:
 * the public list, the class-creation picker, availability planning,
 * substitution candidates, the assistant's scheduling tools.
 */
export const ACTIVE_COACH = { archivedAt: null } as const;

/**
 * Files whose instructor queries deliberately include archived people, with the
 * reason. Anything here that stops being true breaks someone's history.
 */
export const HISTORICAL_COACH_QUERIES: Record<string, string> = {
  "app/api/admin/coach-payments/route.ts":
    "payroll for a past month must still list whoever taught it",
  "app/api/admin/coach-payments/export/route.ts":
    "the exported statement is the same payroll, per instructor",
  "app/api/admin/substitutions/summary/route.ts":
    "names the coaches on historical substitution requests; filtering blanks them",
  "lib/ai/tools/executor.ts":
    "getCoachPerformance reports on a past window (proposeWeeklySchedule in the same file filters)",
  "app/api/admin/substitutions/[id]/approve/route.ts":
    "looks up specific ids that were already notified, not a list to choose from",
  "app/api/coach/substitutions/route.ts":
    "looks up the specific ids a coach chose to ask, not a list to choose from",
  "app/api/admin/coaches/route.ts":
    "queries archived instructors on purpose — it is the screen that lists them for restoring",
};


export type RemovalOutcome = "delete" | "archive" | "blocked";

export interface RemovalPlan {
  outcome: RemovalOutcome;
  /** Future classes that must be reassigned first; the reason for "blocked". */
  futureClasses: number;
  /** Past classes taught — the reason for "archive" rather than "delete". */
  pastClasses: number;
  substitutions: number;
  availabilityBlocks: number;
  payRates: number;
  onDemandVideos: number;
}

/**
 * What removing this instructor would do, and why.
 *
 * The same function answers the confirmation dialog and performs the removal,
 * so the studio cannot be shown one outcome and given another. A button that
 * said "delete" and quietly did something else is what sent FDV hunting for an
 * account that had only been demoted.
 */
export async function planCoachRemoval(
  coachProfileId: string,
  tenantId: string,
): Promise<RemovalPlan> {
  const now = new Date();

  // Classes that were scheduled and never used are noise, not history: clear
  // them from the reckoning the same way removing a discipline does.
  const classIds = (
    await prisma.class.findMany({
      where: {
        tenantId,
        OR: [{ coachId: coachProfileId }, { originalCoachId: coachProfileId }],
      },
      select: { id: true },
    })
  ).map((c) => c.id);
  const inert = new Set(await findInertClassIds(classIds));

  const [future, past, substitutions, availabilityBlocks, payRates, onDemandVideos] =
    await Promise.all([
      prisma.class.count({
        where: {
          tenantId,
          id: { notIn: [...inert] },
          startsAt: { gte: now },
          status: { not: "CANCELLED" },
          OR: [{ coachId: coachProfileId }, { originalCoachId: coachProfileId }],
        },
      }),
      prisma.class.count({
        where: {
          tenantId,
          id: { notIn: [...inert] },
          startsAt: { lt: now },
          OR: [{ coachId: coachProfileId }, { originalCoachId: coachProfileId }],
        },
      }),
      prisma.substitutionRequest.count({
        where: {
          OR: [
            { requestingCoachId: coachProfileId },
            { originalCoachId: coachProfileId },
            { targetCoachId: coachProfileId },
            { acceptedByCoachId: coachProfileId },
          ],
        },
      }),
      prisma.coachAvailabilityBlock.count({ where: { coachId: coachProfileId } }),
      prisma.coachPayRate.count({ where: { coachProfileId } }),
      prisma.onDemandVideo.count({ where: { coachProfileId } }),
    ]);

  // A class next Tuesday with nobody to teach it is worse than an instructor
  // who lingers in a list, so this is the one case that refuses outright.
  const outcome: RemovalOutcome =
    future > 0
      ? "blocked"
      : past > 0 || substitutions > 0 || onDemandVideos > 0
        ? "archive"
        : "delete";

  return {
    outcome,
    futureClasses: future,
    pastClasses: past,
    substitutions,
    availabilityBlocks,
    payRates,
    onDemandVideos,
  };
}
