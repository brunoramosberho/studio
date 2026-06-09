import "server-only";
import { prisma } from "@/lib/db";
import { sendPushToMany, sendPushToUser } from "@/lib/push";
import {
  getTenantBaseUrl,
  sendSubstitutionAccepted,
  sendSubstitutionRejected,
  sendSubstitutionRequest,
  sendSwapApproved,
  sendSwapAcceptedPendingAdmin,
  sendSwapProposal,
} from "@/lib/email";
import { getBrandingForTenantId } from "@/lib/branding.server";
import {
  type AvailabilityBlockLite,
  type CoachSlotStatus,
  getCoachStatusForSlot,
} from "@/lib/availability";
import { getWallClockInZone } from "@/lib/utils";

/**
 * A coach is "eligible" to substitute on a class when:
 *  - They are not the requesting coach
 *  - They have a linked User (so we can notify them)
 *  - Their specialties include the class's discipline (ClassType name)
 *  - The slot status at the class's studio is preferred/ok_if_needed
 *    (or the coach has no availability defined yet, treated as available)
 *  - They don't already teach an overlapping class
 */
export interface EligibleCoach {
  coachProfileId: string;
  userId: string;
  name: string;
  email: string | null;
  image: string | null;
  hasDiscipline: boolean;
  available: boolean;
  slotStatus: CoachSlotStatus;
  hasConflict: boolean;
  weekLoad: number;
}

export async function getEligibleCoaches(
  classId: string,
  tenantId: string,
): Promise<EligibleCoach[]> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, tenantId },
    include: {
      classType: { select: { name: true } },
      coach: { select: { id: true } },
      room: {
        select: {
          studioId: true,
          studio: { select: { city: { select: { timezone: true } } } },
        },
      },
    },
  });
  if (!cls) return [];

  const profiles = await prisma.coachProfile.findMany({
    where: {
      tenantId,
      id: { not: cls.coach.id },
      userId: { not: null },
    },
    include: { user: { select: { id: true, image: true, email: true } } },
    // photoUrl is on CoachProfile itself (not in user) — surfaced via mapping below.
  });

  const userIds = profiles
    .map((p) => p.userId)
    .filter((id): id is string => id != null);

  const blocks = await prisma.coachAvailabilityBlock.findMany({
    where: { tenantId, coachId: { in: userIds } },
    include: {
      studioPreferences: { select: { studioId: true, preference: true } },
    },
  });

  const conflicts = await prisma.class.findMany({
    where: {
      tenantId,
      status: "SCHEDULED",
      coachId: { in: profiles.map((p) => p.id) },
      AND: [
        { startsAt: { lt: cls.endsAt } },
        { endsAt: { gt: cls.startsAt } },
      ],
    },
    select: { coachId: true },
  });
  const conflictByCoach = new Set(conflicts.map((c) => c.coachId));

  const weekStart = new Date(cls.startsAt);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekClasses = await prisma.class.findMany({
    where: {
      tenantId,
      status: "SCHEDULED",
      startsAt: { gte: weekStart, lt: weekEnd },
      coachId: { in: profiles.map((p) => p.id) },
    },
    select: { coachId: true },
  });
  const loadByCoach: Record<string, number> = {};
  for (const c of weekClasses) {
    loadByCoach[c.coachId] = (loadByCoach[c.coachId] || 0) + 1;
  }

  const discipline = cls.classType.name.toLowerCase();
  const studioId = cls.room?.studioId ?? "";
  // Convert the UTC startsAt/endsAt to the studio's wall time so we can
  // compare against coach availability stored as "HH:MM" wall strings.
  const tz = cls.room?.studio?.city?.timezone ?? "Europe/Madrid";
  const startWall = getWallClockInZone(cls.startsAt, tz);
  const endWall = getWallClockInZone(cls.endsAt, tz);
  const classStartMin = startWall.hour * 60 + startWall.minute;
  const classEndMin = endWall.hour * 60 + endWall.minute;
  const slotDate = new Date(startWall.year, startWall.month - 1, startWall.day);

  const result: EligibleCoach[] = profiles.map((p) => {
    const coachBlocks = blocks.filter(
      (b) => b.coachId === p.userId,
    ) as unknown as AvailabilityBlockLite[];
    const slotStatus = getCoachStatusForSlot({
      blocks: coachBlocks,
      date: slotDate,
      startMin: classStartMin,
      endMin: classEndMin,
      studioId,
    });
    const hasAnyAvailability = coachBlocks.some((b) => b.kind === "availability");
    // Until a coach has populated their availability we treat them as
    // available rather than dropping them off the picker — matches the
    // pre-migration behaviour.
    const available = hasAnyAvailability
      ? slotStatus === "preferred" || slotStatus === "ok_if_needed"
      : slotStatus !== "time_off";
    const hasDiscipline = p.specialties.some(
      (s) => s.toLowerCase() === discipline,
    );
    const hasConflict = conflictByCoach.has(p.id);

    return {
      coachProfileId: p.id,
      userId: p.userId!,
      name: p.name,
      email: p.user?.email ?? null,
      // Prefer the studio-curated coach photo (CoachProfile.photoUrl) over
      // the user's personal/Google avatar so the inbox/modal shows the
      // public-facing instructor identity.
      image: p.photoUrl ?? p.user?.image ?? null,
      hasDiscipline,
      available,
      slotStatus,
      hasConflict,
      weekLoad: loadByCoach[p.id] || 0,
    };
  });

  const priority: Record<CoachSlotStatus, number> = {
    preferred: 0,
    ok_if_needed: 1,
    unavailable: 2,
    time_off: 3,
  };

  result.sort((a, b) => {
    if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
    if (a.slotStatus !== b.slotStatus) return priority[a.slotStatus] - priority[b.slotStatus];
    if (a.hasDiscipline !== b.hasDiscipline) return a.hasDiscipline ? -1 : 1;
    return a.weekLoad - b.weekLoad;
  });

  return result;
}

/**
 * Coaches that should be notified when an OPEN request is created. Filters
 * out coaches with hard conflicts (they can't physically take it) and those
 * without the discipline (they're not allowed to take it per requirement #3).
 */
export function pickNotifiableCandidates(
  candidates: EligibleCoach[],
): EligibleCoach[] {
  return candidates.filter((c) => !c.hasConflict && c.hasDiscipline);
}

/**
 * Verify a coach can take a class — used at accept-time as the gate.
 * Returns null if eligible, otherwise a human-readable reason.
 */
export async function checkCoachCanTakeClass(
  coachProfileId: string,
  classId: string,
  tenantId: string,
): Promise<string | null> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, tenantId },
    include: { classType: { select: { name: true } } },
  });
  if (!cls) return "La clase no existe.";
  if (cls.coachId === coachProfileId)
    return "Ya eres el instructor de esta clase.";

  const profile = await prisma.coachProfile.findFirst({
    where: { id: coachProfileId, tenantId },
  });
  if (!profile) return "Instructor no encontrado.";

  const discipline = cls.classType.name.toLowerCase();
  const hasDiscipline = profile.specialties.some(
    (s) => s.toLowerCase() === discipline,
  );
  if (!hasDiscipline)
    return `No tienes "${cls.classType.name}" entre tus especialidades.`;

  const conflict = await prisma.class.findFirst({
    where: {
      tenantId,
      coachId: coachProfileId,
      status: "SCHEDULED",
      AND: [
        { startsAt: { lt: cls.endsAt } },
        { endsAt: { gt: cls.startsAt } },
      ],
    },
    select: { id: true },
  });
  if (conflict) return "Tienes otra clase agendada en ese horario.";

  return null;
}

interface NotifyArgs {
  tenantId: string;
  tenantSlug: string;
  classId: string;
  className: string;
  startsAt: Date;
  fromCoachName: string;
  mode: "OPEN" | "DIRECT";
  note?: string | null;
  recipients: { userId: string; email: string | null; name: string }[];
}

export async function notifyCandidates(args: NotifyArgs): Promise<void> {
  if (args.recipients.length === 0) return;

  const branding = await getBrandingForTenantId(args.tenantId);
  const inboxUrl = `${getTenantBaseUrl(args.tenantSlug)}/coach/substitutions`;

  await prisma.notification.createMany({
    data: args.recipients.map((r) => ({
      userId: r.userId,
      tenantId: args.tenantId,
      type: "substitution_requested",
    })),
  });

  await sendPushToMany(
    args.recipients.map((r) => r.userId),
    {
      title: `Suplencia: ${args.className}`,
      body:
        args.mode === "DIRECT"
          ? `${args.fromCoachName} te eligió como suplente`
          : `${args.fromCoachName} busca suplente`,
      url: "/coach/substitutions",
      tag: `substitution-${args.classId}`,
    },
    args.tenantId,
  );

  await Promise.allSettled(
    args.recipients
      .filter((r) => r.email)
      .map((r) =>
        sendSubstitutionRequest({
          to: r.email!,
          toName: r.name,
          fromCoachName: args.fromCoachName,
          className: args.className,
          date: args.startsAt,
          startTime: args.startsAt,
          mode: args.mode,
          note: args.note,
          inboxUrl,
          branding,
        }),
      ),
  );
}

interface NotifyAcceptedArgs {
  tenantId: string;
  tenantSlug: string;
  classId: string;
  className: string;
  startsAt: Date;
  acceptedByName: string;
  requestingCoachUserId: string | null;
  requestingCoachEmail: string | null;
  requestingCoachName: string;
}

export async function notifyRequestAccepted(
  args: NotifyAcceptedArgs,
): Promise<void> {
  if (!args.requestingCoachUserId) return;

  const branding = await getBrandingForTenantId(args.tenantId);
  const classUrl = `${getTenantBaseUrl(args.tenantSlug)}/coach/class/${args.classId}`;

  await prisma.notification.create({
    data: {
      userId: args.requestingCoachUserId,
      tenantId: args.tenantId,
      type: "substitution_accepted",
    },
  });

  await sendPushToUser(
    args.requestingCoachUserId,
    {
      title: "Suplente confirmado",
      body: `${args.acceptedByName} cubrirá tu clase de ${args.className}`,
      url: `/coach/class/${args.classId}`,
      tag: `substitution-${args.classId}`,
    },
    args.tenantId,
  );

  if (args.requestingCoachEmail) {
    await sendSubstitutionAccepted({
      to: args.requestingCoachEmail,
      toName: args.requestingCoachName,
      acceptedByName: args.acceptedByName,
      className: args.className,
      date: args.startsAt,
      startTime: args.startsAt,
      classUrl,
      branding,
    });
  }
}

interface NotifyRejectedArgs {
  tenantId: string;
  tenantSlug: string;
  className: string;
  startsAt: Date;
  rejectedByName: string;
  rejectionNote?: string | null;
  requestingCoachUserId: string | null;
  requestingCoachEmail: string | null;
  requestingCoachName: string;
}

export async function notifyRequestRejected(
  args: NotifyRejectedArgs,
): Promise<void> {
  if (!args.requestingCoachUserId) return;

  const branding = await getBrandingForTenantId(args.tenantId);
  const inboxUrl = `${getTenantBaseUrl(args.tenantSlug)}/coach/substitutions`;

  await prisma.notification.create({
    data: {
      userId: args.requestingCoachUserId,
      tenantId: args.tenantId,
      type: "substitution_rejected",
    },
  });

  await sendPushToUser(
    args.requestingCoachUserId,
    {
      title: "Suplencia rechazada",
      body: `${args.rejectedByName} no puede cubrir ${args.className}`,
      url: "/coach/substitutions",
    },
    args.tenantId,
  );

  if (args.requestingCoachEmail) {
    await sendSubstitutionRejected({
      to: args.requestingCoachEmail,
      toName: args.requestingCoachName,
      rejectedByName: args.rejectedByName,
      className: args.className,
      date: args.startsAt,
      rejectionNote: args.rejectionNote,
      inboxUrl,
      branding,
    });
  }
}

// ── Substitutions v2 ──────────────────────────────────────────────────

/**
 * Decide whether a sub request created right now would be "urgent"
 * (skip admin approval, go straight to notifying coaches) or needs admin
 * review. The threshold is tenant-configurable.
 */
export function isUrgentSubRequest(
  classStartsAt: Date,
  thresholdHours: number,
): boolean {
  const hoursUntil = (classStartsAt.getTime() - Date.now()) / 3_600_000;
  return hoursUntil <= thresholdHours;
}

/** A soft availability concern surfaced as a badge rather than a hard filter. */
export type SwapAvailabilityWarning = "absent" | "unmarked" | null;

export interface SwapCandidate {
  classId: string;
  classTypeName: string;
  startsAt: Date;
  endsAt: Date;
  coach: { profileId: string; userId: string; name: string; image: string | null };
  studio: { id: string; name: string };
  /** The other coach has YOUR class's discipline in their specialties. */
  theyCanTeachYours: boolean;
  /** YOU have the other class's discipline in your specialties. */
  youCanTeachTheirs: boolean;
  /** The other coach's availability concern for YOUR class slot. */
  theirAvailabilityWarning: SwapAvailabilityWarning;
  /** YOUR availability concern for THEIR class slot. */
  yourAvailabilityWarning: SwapAvailabilityWarning;
  /** True when both disciplines match and neither side has a warning. */
  fullyCompatible: boolean;
}

export interface SwapCandidatesResult {
  candidates: SwapCandidate[];
  /** How many future classes by other coaches existed in the horizon, before
   *  ranking — lets the UI explain an empty list ("nobody scheduled" vs
   *  "everyone has a clashing class"). */
  totalFutureClasses: number;
  /** Whether the requesting coach has any specialties defined — used to nudge
   *  them toward filling their profile if matches look thin. */
  requesterHasSpecialties: boolean;
}

/**
 * For coach A's class X, find FUTURE classes by OTHER coaches that A could
 * swap into. We only HARD-exclude swaps that are physically impossible:
 *   - The other coach already teaches a class at X's time, or
 *   - A already teaches a class at the candidate class's time.
 *
 * Discipline mismatches and availability concerns (time_off / "didn't mark
 * available") are NOT filtered out — they're surfaced as flags so the picker
 * still shows options and the coach (and the approving admin) can judge. This
 * mirrors the "Pedir suplente" tab, which lists every coach and just annotates
 * them, instead of returning an empty list when specialties aren't filled in.
 *
 * Results are ranked best-first: fully compatible swaps, then partial ones,
 * then by start date.
 */
export async function getSwapCandidates(
  classId: string,
  tenantId: string,
  options?: { horizonDays?: number },
): Promise<SwapCandidatesResult> {
  const horizonDays = options?.horizonDays ?? 42;
  const empty: SwapCandidatesResult = {
    candidates: [],
    totalFutureClasses: 0,
    requesterHasSpecialties: false,
  };

  const cls = await prisma.class.findFirst({
    where: { id: classId, tenantId },
    include: {
      classType: { select: { name: true } },
      coach: { select: { id: true, userId: true, specialties: true } },
      room: {
        select: {
          studioId: true,
          studio: { select: { city: { select: { timezone: true } } } },
        },
      },
    },
  });
  if (!cls || !cls.coach.userId || !cls.room) return empty;

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + horizonDays * 86_400_000);

  const future = await prisma.class.findMany({
    where: {
      tenantId,
      status: "SCHEDULED",
      startsAt: { gt: now, lt: horizonEnd },
      coachId: { not: cls.coach.id },
    },
    include: {
      classType: { select: { name: true } },
      coach: {
        select: {
          id: true,
          userId: true,
          name: true,
          photoUrl: true,
          specialties: true,
        },
      },
      room: {
        select: {
          studio: {
            select: {
              id: true,
              name: true,
              city: { select: { timezone: true } },
            },
          },
          studioId: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const requesterHasSpecialties = cls.coach.specialties.length > 0;

  // Pull both source coach blocks (to check A taking B's class) and the
  // candidate coaches' blocks (to check B taking A's class) in one go.
  const candidateUserIds = Array.from(
    new Set(future.map((c) => c.coach.userId).filter((id): id is string => !!id)),
  );

  const [sourceBlocks, candidateBlocks] = await Promise.all([
    prisma.coachAvailabilityBlock.findMany({
      where: {
        tenantId,
        coachId: cls.coach.userId,
        status: { in: ["active", "pending_approval"] },
      },
      include: {
        studioPreferences: { select: { studioId: true, preference: true } },
      },
    }),
    prisma.coachAvailabilityBlock.findMany({
      where: {
        tenantId,
        coachId: { in: candidateUserIds },
        status: { in: ["active", "pending_approval"] },
      },
      include: {
        studioPreferences: { select: { studioId: true, preference: true } },
      },
    }),
  ]);

  const blocksByUser = new Map<string, typeof candidateBlocks>();
  for (const b of candidateBlocks) {
    const arr = blocksByUser.get(b.coachId) ?? [];
    arr.push(b);
    blocksByUser.set(b.coachId, arr);
  }

  // Source class wall-time context
  const sourceTz = cls.room.studio?.city?.timezone ?? "Europe/Madrid";
  const sourceStartWall = getWallClockInZone(cls.startsAt, sourceTz);
  const sourceEndWall = getWallClockInZone(cls.endsAt, sourceTz);
  const sourceStartMin = sourceStartWall.hour * 60 + sourceStartWall.minute;
  const sourceEndMin = sourceEndWall.hour * 60 + sourceEndWall.minute;
  const sourceDate = new Date(
    sourceStartWall.year,
    sourceStartWall.month - 1,
    sourceStartWall.day,
  );
  const sourceDiscipline = cls.classType.name.toLowerCase();
  const sourceStudioId = cls.room.studioId;

  const sourceHasAnyAvailability = sourceBlocks.some((b) => b.kind === "availability");

  // Candidate coaches who already teach something at A's class time — a hard
  // physical conflict, so they can't take A's class.
  const candidateProfileIds = Array.from(new Set(future.map((c) => c.coach.id)));
  const candidateOtherClasses = await prisma.class.findMany({
    where: {
      tenantId,
      status: "SCHEDULED",
      coachId: { in: candidateProfileIds },
      AND: [
        { startsAt: { lt: cls.endsAt } },
        { endsAt: { gt: cls.startsAt } },
      ],
    },
    select: { coachId: true },
  });
  const candidateConflictAtSource = new Set(
    candidateOtherClasses.map((c) => c.coachId),
  );

  // A's own future classes — used to rule out candidate classes A couldn't
  // physically take because they already teach at that time.
  const sourceOwnClasses = await prisma.class.findMany({
    where: {
      tenantId,
      status: "SCHEDULED",
      coachId: cls.coach.id,
      startsAt: { gt: now, lt: horizonEnd },
      NOT: { id: cls.id },
    },
    select: { startsAt: true, endsAt: true },
  });

  // Returns a soft availability warning, treating "no calendar set up" as fine
  // (we don't want coaches who never configured availability to look blocked).
  const warningFor = (
    status: CoachSlotStatus,
    hasAvailabilityBlocks: boolean,
  ): SwapAvailabilityWarning => {
    if (status === "time_off") return "absent";
    if (hasAvailabilityBlocks && status === "unavailable") return "unmarked";
    return null;
  };

  const ranked: { cand: SwapCandidate; score: number }[] = [];

  for (const b of future) {
    if (!b.coach.userId || !b.room?.studio) continue;

    // Hard filter 1: the other coach is already teaching at A's time.
    if (candidateConflictAtSource.has(b.coach.id)) continue;

    // Hard filter 2: A is already teaching at the candidate class's time.
    const sourceConflictAtCandidate = sourceOwnClasses.some(
      (c) => c.startsAt < b.endsAt && c.endsAt > b.startsAt,
    );
    if (sourceConflictAtCandidate) continue;

    // Discipline checks both ways — surfaced as flags, not filters.
    const theyCanTeachYours = b.coach.specialties.some(
      (s) => s.toLowerCase() === sourceDiscipline,
    );
    const youCanTeachTheirs = cls.coach.specialties.some(
      (s) => s.toLowerCase() === b.classType.name.toLowerCase(),
    );

    // The other coach's availability at A's slot.
    const bBlocks = (blocksByUser.get(b.coach.userId) ?? []) as unknown as AvailabilityBlockLite[];
    const bHasAvail = bBlocks.some((bb) => bb.kind === "availability");
    const bStatusForSource = getCoachStatusForSlot({
      blocks: bBlocks,
      date: sourceDate,
      startMin: sourceStartMin,
      endMin: sourceEndMin,
      studioId: sourceStudioId,
    });
    const theirAvailabilityWarning = warningFor(bStatusForSource, bHasAvail);

    // A's availability at the candidate slot.
    const bTz = b.room.studio.city?.timezone ?? "Europe/Madrid";
    const bStartWall = getWallClockInZone(b.startsAt, bTz);
    const bEndWall = getWallClockInZone(b.endsAt, bTz);
    const bStartMin = bStartWall.hour * 60 + bStartWall.minute;
    const bEndMin = bEndWall.hour * 60 + bEndWall.minute;
    const bDate = new Date(bStartWall.year, bStartWall.month - 1, bStartWall.day);
    const sourceStatusForB = getCoachStatusForSlot({
      blocks: sourceBlocks as unknown as AvailabilityBlockLite[],
      date: bDate,
      startMin: bStartMin,
      endMin: bEndMin,
      studioId: b.room.studio.id,
    });
    const yourAvailabilityWarning = warningFor(
      sourceStatusForB,
      sourceHasAnyAvailability,
    );

    const fullyCompatible =
      theyCanTeachYours &&
      youCanTeachTheirs &&
      theirAvailabilityWarning === null &&
      yourAvailabilityWarning === null;

    // Rank: discipline matches weigh most, then availability cleanliness.
    let score = 0;
    if (theyCanTeachYours) score += 4;
    if (youCanTeachTheirs) score += 4;
    if (theirAvailabilityWarning === null) score += 2;
    else if (theirAvailabilityWarning === "unmarked") score += 1;
    if (yourAvailabilityWarning === null) score += 2;
    else if (yourAvailabilityWarning === "unmarked") score += 1;

    ranked.push({
      score,
      cand: {
        classId: b.id,
        classTypeName: b.classType.name,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        coach: {
          profileId: b.coach.id,
          userId: b.coach.userId,
          name: b.coach.name,
          image: b.coach.photoUrl ?? null,
        },
        studio: { id: b.room.studio.id, name: b.room.studio.name },
        theyCanTeachYours,
        youCanTeachTheirs,
        theirAvailabilityWarning,
        yourAvailabilityWarning,
        fullyCompatible,
      },
    });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.cand.startsAt.getTime() - b.cand.startsAt.getTime();
  });

  return {
    candidates: ranked.map((r) => r.cand),
    totalFutureClasses: future.length,
    requesterHasSpecialties,
  };
}

// ── Notification helpers for the v2 flows ─────────────────────────────

async function getAdminUserIds(tenantId: string): Promise<string[]> {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, role: "ADMIN" },
    select: { userId: true },
  });
  return memberships.map((m) => m.userId);
}

interface NotifyAdminPendingArgs {
  tenantId: string;
  tenantSlug: string;
  requestId: string;
  classId: string;
  className: string;
  startsAt: Date;
  fromCoachName: string;
  mode: "REQUEST" | "MANUAL_ASSIGN" | "SWAP";
  needsApproval: boolean;
}

/**
 * Push to admins when a new sub flow needs their attention:
 *  - PENDING_ADMIN request (needsApproval=true) — they have to approve before notifying coaches
 *  - MANUAL_ASSIGN / urgent REQUEST (needsApproval=false) — informational only
 *  - SWAP after the target accepted — they have to approve the swap
 */
export async function notifyAdminsOfSubFlow(
  args: NotifyAdminPendingArgs,
): Promise<void> {
  const adminIds = await getAdminUserIds(args.tenantId);
  if (adminIds.length === 0) return;

  await prisma.notification.createMany({
    data: adminIds.map((userId) => ({
      userId,
      tenantId: args.tenantId,
      type: args.needsApproval ? "substitution_pending_admin" : "substitution_informational",
    })),
  });

  const subject =
    args.mode === "SWAP"
      ? args.needsApproval
        ? `Aprobar intercambio: ${args.className}`
        : `Intercambio creado: ${args.className}`
      : args.mode === "MANUAL_ASSIGN"
      ? `Cobertura asignada: ${args.className}`
      : args.needsApproval
      ? `Aprobar suplencia: ${args.className}`
      : `Solicitud de suplencia: ${args.className}`;

  await sendPushToMany(
    adminIds,
    {
      title: subject,
      body: `${args.fromCoachName} · ${args.className}`,
      url: "/admin/substitutions",
      tag: `sub-admin-${args.requestId}`,
    },
    args.tenantId,
  );
}

interface NotifySwapTargetArgs {
  tenantId: string;
  tenantSlug: string;
  targetCoachUserId: string;
  targetCoachEmail: string | null;
  targetCoachName: string;
  fromCoachName: string;
  /** The target's own class (what they'd hand to the requester). */
  yourClassName: string;
  yourClassStartsAt: Date;
  /** The requester's class (what the target would take). */
  theirClassName: string;
  theirClassStartsAt: Date;
  note?: string | null;
}

export async function notifySwapTarget(args: NotifySwapTargetArgs): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: args.targetCoachUserId,
      tenantId: args.tenantId,
      type: "substitution_swap_requested",
    },
  });

  await sendPushToUser(
    args.targetCoachUserId,
    {
      title: `Propuesta de intercambio`,
      body: `${args.fromCoachName} te propone cambiar tu clase de ${args.yourClassName} por la suya de ${args.theirClassName}`,
      url: "/coach/substitutions",
      tag: `swap-${args.tenantId}`,
    },
    args.tenantId,
  );

  if (args.targetCoachEmail) {
    const branding = await getBrandingForTenantId(args.tenantId);
    await sendSwapProposal({
      to: args.targetCoachEmail,
      toName: args.targetCoachName,
      fromCoachName: args.fromCoachName,
      yourClassName: args.yourClassName,
      yourClassDate: args.yourClassStartsAt,
      theirClassName: args.theirClassName,
      theirClassDate: args.theirClassStartsAt,
      note: args.note,
      inboxUrl: `${getTenantBaseUrl(args.tenantSlug)}/coach/substitutions`,
      branding,
    });
  }
}

interface NotifySwapAcceptedArgs {
  tenantId: string;
  tenantSlug: string;
  requestingCoachUserId: string | null;
  requestingCoachEmail: string | null;
  requestingCoachName: string;
  acceptedByName: string;
  /** The requester's own class that's being swapped away. */
  yourClassName: string;
  yourClassStartsAt: Date;
}

/**
 * Tell the requesting coach that the other coach accepted their swap — it's
 * now waiting on admin approval. Without this the requester was left in the
 * dark between "sent" and "approved".
 */
export async function notifySwapAcceptedPendingAdmin(
  args: NotifySwapAcceptedArgs,
): Promise<void> {
  if (!args.requestingCoachUserId) return;

  await prisma.notification.create({
    data: {
      userId: args.requestingCoachUserId,
      tenantId: args.tenantId,
      type: "substitution_swap_accepted_pending_admin",
    },
  });

  await sendPushToUser(
    args.requestingCoachUserId,
    {
      title: "Intercambio aceptado",
      body: `${args.acceptedByName} aceptó tu intercambio. Falta la aprobación del admin.`,
      url: "/coach/substitutions",
      tag: `swap-${args.tenantId}`,
    },
    args.tenantId,
  );

  if (args.requestingCoachEmail) {
    const branding = await getBrandingForTenantId(args.tenantId);
    await sendSwapAcceptedPendingAdmin({
      to: args.requestingCoachEmail,
      toName: args.requestingCoachName,
      acceptedByName: args.acceptedByName,
      yourClassName: args.yourClassName,
      yourClassDate: args.yourClassStartsAt,
      inboxUrl: `${getTenantBaseUrl(args.tenantSlug)}/coach/substitutions`,
      branding,
    });
  }
}

interface SwapApprovedSide {
  userId: string | null;
  email: string | null;
  name: string;
  /** The class this coach now teaches after the swap. */
  classId: string;
  className: string;
  classStartsAt: Date;
}

/**
 * Tell BOTH coaches that an admin approved their swap, each with the class
 * they're now responsible for. Previously only the requester heard back and
 * the accepting coach was never told they'd picked up a new class.
 */
export async function notifySwapApproved(args: {
  tenantId: string;
  tenantSlug: string;
  requester: SwapApprovedSide;
  acceptedBy: SwapApprovedSide;
}): Promise<void> {
  const branding = await getBrandingForTenantId(args.tenantId);
  const base = getTenantBaseUrl(args.tenantSlug);

  for (const side of [args.requester, args.acceptedBy]) {
    if (!side.userId) continue;
    await prisma.notification.create({
      data: {
        userId: side.userId,
        tenantId: args.tenantId,
        type: "substitution_swap_approved",
      },
    });
    await sendPushToUser(
      side.userId,
      {
        title: "Intercambio aprobado",
        body: `Ahora das ${side.className}`,
        url: `/coach/class/${side.classId}`,
        tag: `swap-${args.tenantId}`,
      },
      args.tenantId,
    );
    if (side.email) {
      await sendSwapApproved({
        to: side.email,
        toName: side.name,
        className: side.className,
        date: side.classStartsAt,
        startTime: side.classStartsAt,
        classUrl: `${base}/coach/class/${side.classId}`,
        branding,
      });
    }
  }
}

interface NotifyCoverageResolvedArgs {
  tenantId: string;
  classId: string;
  className: string;
  fromCoachName: string;
  acceptedByName: string;
}

/**
 * Informational push to admins when a coverage request is resolved (a coach
 * accepted a REQUEST). Keeps the studio in the loop without an extra email.
 */
export async function notifyAdminsCoverageResolved(
  args: NotifyCoverageResolvedArgs,
): Promise<void> {
  const adminIds = await getAdminUserIds(args.tenantId);
  if (adminIds.length === 0) return;

  await prisma.notification.createMany({
    data: adminIds.map((userId) => ({
      userId,
      tenantId: args.tenantId,
      type: "substitution_informational",
    })),
  });

  await sendPushToMany(
    adminIds,
    {
      title: `Cobertura resuelta: ${args.className}`,
      body: `${args.acceptedByName} cubrirá la clase de ${args.fromCoachName}`,
      url: "/admin/substitutions",
      tag: `sub-admin-resolved-${args.classId}`,
    },
    args.tenantId,
  );
}
