/**
 * Challenge points engine — the database side of scoring.
 *
 * Everything here is idempotent and reversible, because attendance is not:
 * front desk marks the wrong person, undoes it, marks them late, and the
 * cron marks the rest. So points are written as a LEDGER (one row per
 * booking × kind, unique in the database) and the participant's totals are
 * always recomputed from that ledger — never incremented in place.
 */

import { prisma } from "@/lib/db";
import { getWallClockInZone } from "@/lib/utils";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";
import {
  computeStreaks,
  emptyLedger,
  scoreClass,
  type AwardedEntry,
  type BonusSlot,
  type ChallengeRules,
  type ParticipantLedger,
  type ScorableClass,
} from "./scoring";

const FALLBACK_TIMEZONE = "Europe/Madrid";

export type AwardOutcome =
  | "awarded"
  | "already_awarded"
  | "no_challenge"
  | "not_enrolled"
  | "not_attended"
  | "not_completed"
  | "other_studio"
  | "outside_window"
  | "capped";

export interface AwardResult {
  outcome: AwardOutcome;
  points: number;
  /** True when this class sealed the participant's personal window. */
  activated: boolean;
}

/** The one challenge accepting points for a tenant right now. */
export async function getActiveChallenge(tenantId: string) {
  return prisma.challenge.findFirst({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export function rulesOf(challenge: {
  basePoints: number;
  firstDisciplineBonus: number;
  firstCoachBonus: number;
  dailyPointsCap: number | null;
  bonusSlots: unknown;
}): ChallengeRules {
  return {
    basePoints: challenge.basePoints,
    firstDisciplineBonus: challenge.firstDisciplineBonus,
    firstCoachBonus: challenge.firstCoachBonus,
    dailyPointsCap: challenge.dailyPointsCap,
    bonusSlots: parseBonusSlots(challenge.bonusSlots),
  };
}

function parseBonusSlots(raw: unknown): BonusSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const { dayOfWeek, hour, points } = s as Record<string, unknown>;
    if (typeof dayOfWeek !== "number" || typeof hour !== "number") return [];
    if (typeof points !== "number" || points <= 0) return [];
    return [{ dayOfWeek, hour, points }];
  });
}

/**
 * Award points for an attended booking. Safe to call repeatedly and from
 * every path that can mark attendance (check-in, admin, cron) — the unique
 * ledger constraint makes the second call a no-op.
 */
export async function awardForBooking(bookingId: string): Promise<AwardResult> {
  const nothing = (outcome: AwardOutcome): AwardResult => ({
    outcome,
    points: 0,
    activated: false,
  });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      status: true,
      classId: true,
      class: {
        select: {
          id: true,
          startsAt: true,
          status: true,
          classTypeId: true,
          coachId: true,
          room: {
            select: {
              studioId: true,
              studio: { select: { city: { select: { timezone: true } } } },
            },
          },
        },
      },
    },
  });

  // Guests and platform bookings without a linked user can't hold points.
  const klass = booking?.class;
  if (!booking?.userId || !klass) return nothing("not_enrolled");
  if (booking.status !== "ATTENDED") return nothing("not_attended");
  // Check-in is provisional — the front desk marks, unmarks and corrects it all
  // through the hour, and Wellhub members check in from their own app without
  // ever reaching the studio. Completing the class is what settles who actually
  // attended, so that is when points are paid. Everything before it is a no-op,
  // and the completion pass picks up whoever ended up present.
  if (klass.status !== "COMPLETED") return nothing("not_completed");

  const challenge = await getActiveChallenge(booking.tenantId);
  if (!challenge) return nothing("no_challenge");

  const participant = await prisma.challengeParticipant.findUnique({
    where: { challengeId_userId: { challengeId: challenge.id, userId: booking.userId } },
  });
  if (!participant) return nothing("not_enrolled");

  if (challenge.studioIds.length > 0 && !challenge.studioIds.includes(klass.room.studioId)) {
    return nothing("other_studio");
  }

  const classStart = klass.startsAt;
  const window = resolveWindow(participant, challenge, classStart);
  if (!window) return nothing("outside_window");

  // The class itself scores once, but the photo bonus can arrive days later —
  // so an already-scored booking is not a terminal state, only a filter on
  // which kinds are still missing.
  const existing = await prisma.challengePointEntry.findMany({
    where: { challengeId: challenge.id, bookingId: booking.id },
    select: { kind: true },
  });
  const classScored = existing.some((e) => e.kind !== "PHOTO");
  const photoScored = existing.some((e) => e.kind === "PHOTO");

  const photoAward = photoScored
    ? null
    : await resolvePhotoAward(challenge, booking.userId, klass.id, booking.tenantId, window);

  if (classScored && !photoAward) return nothing("already_awarded");

  const timezone = klass.room.studio?.city?.timezone ?? FALLBACK_TIMEZONE;
  const wall = getWallClockInZone(classStart, timezone);
  const cls: ScorableClass = {
    classTypeId: klass.classTypeId,
    coachId: klass.coachId,
    localDate: `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`,
    dayOfWeek: wall.weekday,
    hour: wall.hour,
  };

  const awards: AwardedEntry[] = [];
  if (!classScored) {
    const ledger = await loadLedger(challenge.id, participant.id);
    awards.push(...scoreClass(cls, rulesOf(challenge), ledger));
  }
  if (photoAward) awards.push(photoAward);

  if (awards.length === 0) {
    // Daily cap already spent: still activate the window and count the class.
    await persist(participant.id, booking.tenantId, window);
    return { outcome: "capped", points: 0, activated: window.activated };
  }

  await prisma.challengePointEntry.createMany({
    data: awards.map((a) => ({
      challengeId: challenge.id,
      participantId: participant.id,
      tenantId: booking.tenantId,
      bookingId: booking.id,
      classId: klass.id,
      classTypeId: cls.classTypeId,
      coachId: cls.coachId,
      kind: a.kind,
      points: a.points,
      earnedOn: new Date(`${cls.localDate}T00:00:00.000Z`),
    })),
    skipDuplicates: true,
  });

  await persist(participant.id, booking.tenantId, window);

  return {
    outcome: "awarded",
    points: awards.reduce((sum, a) => sum + a.points, 0),
    activated: window.activated,
  };
}

/**
 * The photo bonus, if this booking has one coming. Pays when the member has
 * published media on the class's completed post — once per class, and the
 * entry survives the photo being deleted afterwards, so delete-and-reupload
 * can never pay twice (the ledger unique would refuse the duplicate anyway).
 *
 * The upload must have happened while the member's window was open: judged on
 * the photo's own createdAt, not on when this reconcile runs, so a front-desk
 * attendance correction months later still restores exactly what was earned.
 */
async function resolvePhotoAward(
  challenge: { id: string; photoBonus: number },
  userId: string,
  classId: string,
  tenantId: string,
  window: ResolvedWindow,
): Promise<AwardedEntry | null> {
  if (challenge.photoBonus <= 0) return null;
  const photo = await prisma.photo.findFirst({
    where: {
      userId,
      feedEvent: {
        tenantId,
        eventType: "CLASS_COMPLETED",
        payload: { path: ["classId"], equals: classId },
      },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!photo || photo.createdAt > window.endsAt) return null;
  return { kind: "PHOTO", points: challenge.photoBonus };
}

/**
 * Reconcile a booking's points with its CURRENT status. Call this from every
 * path that touches attendance — check-in, undo, walk-in, no-show, completion,
 * cron — and it works out the direction itself, so no call site can wire the
 * wrong one.
 *
 * This is a reconcile, not an award: before the class is COMPLETED it can only
 * ever take points away, never grant them. That's what makes it safe to call
 * from check-in, where nothing should be paid out yet, while still settling a
 * walk-in added after the roll was already taken.
 *
 * Never throws — points must not be able to break a check-in.
 */
export async function syncPointsForBooking(bookingId: string): Promise<AwardResult> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });
    if (!booking) return { outcome: "not_enrolled", points: 0, activated: false };
    if (booking.status === "ATTENDED") return awardForBooking(bookingId);
    await revokeForBooking(bookingId);
    return { outcome: "not_attended", points: 0, activated: false };
  } catch (err) {
    console.error("Challenge points sync failed:", err);
    return { outcome: "not_enrolled", points: 0, activated: false };
  }
}

/**
 * A member published media on a class post — route it to their booking and
 * through the same gate as everything else, so a photo can never pay without
 * a completed, attended class behind it. Never throws: points must not be
 * able to break an upload.
 */
export async function syncPhotoPointsForClassPost(
  tenantId: string,
  classId: string,
  userId: string,
): Promise<void> {
  try {
    const challenge = await getActiveChallenge(tenantId);
    if (!challenge || challenge.photoBonus <= 0) return;
    const booking = await prisma.booking.findFirst({
      where: { tenantId, classId, userId, status: "ATTENDED" },
      select: { id: true },
    });
    if (!booking) return;
    await syncPointsForBooking(booking.id);
  } catch (err) {
    console.error("Challenge photo points sync failed:", err);
  }
}

/**
 * Remove a booking's points — attendance was undone, or the booking was
 * cancelled after check-in. If this was the class that started the clock,
 * the window reopens so the member isn't punished for a front-desk mistake.
 */
export async function revokeForBooking(bookingId: string): Promise<void> {
  const entries = await prisma.challengePointEntry.findMany({
    where: { bookingId },
    select: { challengeId: true, participantId: true, tenantId: true },
    take: 1,
  });
  const entry = entries[0];
  if (!entry) return;

  await prisma.challengePointEntry.deleteMany({ where: { bookingId } });
  await recomputeParticipant(entry.participantId, entry.tenantId);
}

interface ResolvedWindow {
  startsAt: Date;
  endsAt: Date;
  activated: boolean;
}

/**
 * The participant's personal window. Enrolling doesn't start the clock —
 * the first class does, so signing up early costs nothing. Activation is
 * only possible until enrollment closes, which bounds the whole challenge.
 */
function resolveWindow(
  participant: { startsAt: Date | null; endsAt: Date | null },
  challenge: { durationDays: number; enrollClosesAt: Date },
  classStart: Date,
): ResolvedWindow | null {
  if (participant.startsAt && participant.endsAt) {
    if (classStart < participant.startsAt || classStart > participant.endsAt) return null;
    return { startsAt: participant.startsAt, endsAt: participant.endsAt, activated: false };
  }
  if (classStart > challenge.enrollClosesAt) return null; // never activated in time
  const endsAt = new Date(classStart);
  endsAt.setUTCDate(endsAt.getUTCDate() + challenge.durationDays);
  return { startsAt: classStart, endsAt, activated: true };
}

async function loadLedger(challengeId: string, participantId: string): Promise<ParticipantLedger> {
  const rows = await prisma.challengePointEntry.findMany({
    where: { challengeId, participantId },
    select: { classTypeId: true, coachId: true, points: true, kind: true, earnedOn: true },
  });
  const ledger = emptyLedger();
  for (const r of rows) {
    ledger.disciplineIds.add(r.classTypeId);
    ledger.coachIds.add(r.coachId);
    // Only cappable kinds count towards the daily cap — see scoring.ts.
    if (r.kind !== "BASE" && r.kind !== "OFF_PEAK") continue;
    const date = r.earnedOn.toISOString().slice(0, 10);
    ledger.pointsByDate.set(date, (ledger.pointsByDate.get(date) ?? 0) + r.points);
  }
  return ledger;
}

async function persist(
  participantId: string,
  tenantId: string,
  window: ResolvedWindow,
): Promise<void> {
  if (window.activated) {
    await prisma.challengeParticipant.update({
      where: { id: participantId },
      data: { startsAt: window.startsAt, endsAt: window.endsAt },
    });
  }
  await recomputeParticipant(participantId, tenantId);
}

/**
 * Rebuild a participant's cached totals from the ledger. Cheap enough to run
 * on every award, and the only way the cache can be trusted after revokes.
 */
export async function recomputeParticipant(
  participantId: string,
  tenantId: string,
): Promise<void> {
  const [entries, timezone] = await Promise.all([
    prisma.challengePointEntry.findMany({
      where: { participantId },
      select: { points: true, earnedOn: true, bookingId: true },
    }),
    tenantTimezone(tenantId),
  ]);

  const totalPoints = entries.reduce((sum, e) => sum + e.points, 0);
  const classesCount = new Set(entries.map((e) => e.bookingId)).size;
  const dates = entries.map((e) => e.earnedOn.toISOString().slice(0, 10));
  const today = localToday(timezone);
  const { current, longest } = computeStreaks(dates, today);
  const lastDate = dates.sort().at(-1) ?? null;

  await prisma.challengeParticipant.update({
    where: { id: participantId },
    data: {
      totalPoints,
      classesCount,
      currentStreak: current,
      longestStreak: longest,
      lastActivityDate: lastDate ? new Date(`${lastDate}T00:00:00.000Z`) : null,
    },
  });
}

async function tenantTimezone(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, scheduleReleaseTimezone: true },
  });
  if (!tenant) return FALLBACK_TIMEZONE;
  return resolveScheduleTimezone(tenant);
}

export function localToday(timezone: string, now: Date = new Date()): string {
  const w = getWallClockInZone(now, timezone);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** Days the participant has been running, for pace ranking. */
export function daysElapsed(
  participant: { startsAt: Date | null; endsAt: Date | null },
  now: Date = new Date(),
): number {
  if (!participant.startsAt) return 0;
  const end = participant.endsAt && participant.endsAt < now ? participant.endsAt : now;
  const ms = end.getTime() - participant.startsAt.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}
