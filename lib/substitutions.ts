import "server-only";
import { prisma } from "@/lib/db";
import { sendPushToMany, sendPushToUser } from "@/lib/push";
import {
  getTenantBaseUrl,
  sendSubstitutionAccepted,
  sendSubstitutionRejected,
  sendSubstitutionRequest,
} from "@/lib/email";
import { getBrandingForTenantId } from "@/lib/branding.server";
import { getCoverageStatus } from "@/lib/availability";

/**
 * A coach is "eligible" to substitute on a class when:
 *  - They are not the requesting coach
 *  - They have a linked User (so we can notify them)
 *  - Their specialties include the class's discipline (ClassType name)
 *  - Their availability for that day isn't fully blocked
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

  const result: EligibleCoach[] = profiles.map((p) => {
    const coachBlocks = blocks.filter((b) => b.coachId === p.userId);
    const coverage = getCoverageStatus(coachBlocks, cls.startsAt);
    const available = coverage === "available" || coverage === "empty";
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
      hasConflict,
      weekLoad: loadByCoach[p.id] || 0,
    };
  });

  result.sort((a, b) => {
    if (a.hasConflict !== b.hasConflict) return a.hasConflict ? 1 : -1;
    if (a.available !== b.available) return a.available ? -1 : 1;
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
