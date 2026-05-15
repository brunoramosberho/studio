import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type {
  PlannerConstraints,
  ProposedClass,
  ScheduleProposal,
} from "./types";

const CONFIRMED_OR_ATTENDED = ["CONFIRMED", "ATTENDED"] as const;

interface ExecutorArgs {
  tenantId: string;
  conversationId: string;
}

export async function executePlannerTool(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  args: ExecutorArgs,
): Promise<unknown> {
  switch (name) {
    case "get_planner_resources":
      return getPlannerResources(input, args.tenantId);
    case "get_coach_availability_window":
      return getCoachAvailabilityWindow(input, args.tenantId);
    case "propose_schedule_plan":
      return proposeSchedulePlan(input, args);
    default:
      return { error: `Unknown planner tool: ${name}` };
  }
}

async function getPlannerResources(
  input: { include_history?: boolean },
  tenantId: string,
) {
  const [studios, classTypes, coachProfiles] = await Promise.all([
    prisma.studio.findMany({
      where: { tenantId },
      include: {
        rooms: {
          select: {
            id: true,
            name: true,
            maxCapacity: true,
            classTypes: { select: { id: true } },
          },
        },
      },
    }),
    prisma.classType.findMany({
      where: { tenantId },
      select: { id: true, name: true, duration: true, color: true },
    }),
    prisma.coachProfile.findMany({
      where: { tenantId },
      include: {
        classes: {
          where: { startsAt: { gte: daysAgo(28) } },
          select: { classTypeId: true },
        },
      },
    }),
  ]);

  const coaches = coachProfiles.map((c) => {
    const ids = new Set<string>();
    for (const cl of c.classes) ids.add(cl.classTypeId);
    const recentDisciplines = classTypes
      .filter((ct) => ids.has(ct.id))
      .map((ct) => ct.name);
    return {
      id: c.id,
      name: c.name,
      recent_disciplines: recentDisciplines,
    };
  });

  let history: unknown = null;
  if (input.include_history) {
    const historicalClasses = await prisma.class.findMany({
      where: {
        tenantId,
        startsAt: { gte: daysAgo(28) },
        status: { not: "CANCELLED" },
      },
      include: {
        classType: { select: { id: true, name: true } },
        room: { select: { maxCapacity: true } },
        _count: {
          select: {
            bookings: { where: { status: { in: [...CONFIRMED_OR_ATTENDED] } } },
            waitlist: true,
          },
        },
      },
    });

    const slotStats = new Map<
      string,
      { fillRateSum: number; waitlistSum: number; count: number; classType: string }
    >();
    for (const c of historicalClasses) {
      const day = format(c.startsAt, "EEEE", { locale: es });
      const time = format(c.startsAt, "HH:mm");
      const key = `${day}|${time}|${c.classType.name}`;
      const cap = c.room.maxCapacity || 1;
      const fillRate = (c._count.bookings / cap) * 100;
      const existing = slotStats.get(key) ?? {
        fillRateSum: 0,
        waitlistSum: 0,
        count: 0,
        classType: c.classType.name,
      };
      existing.fillRateSum += fillRate;
      existing.waitlistSum += c._count.waitlist;
      existing.count += 1;
      slotStats.set(key, existing);
    }

    history = {
      weeks_analyzed: 4,
      top_slots: Array.from(slotStats.entries())
        .map(([key, data]) => {
          const [day, time, classType] = key.split("|");
          return {
            day,
            time,
            class_type: classType,
            avg_fill_rate: Math.round(data.fillRateSum / data.count),
            avg_waitlist: Math.round(data.waitlistSum / data.count),
            samples: data.count,
          };
        })
        .sort((a, b) => b.avg_fill_rate - a.avg_fill_rate)
        .slice(0, 25),
    };
  }

  return {
    studios: studios.map((s) => ({
      id: s.id,
      name: s.name,
      rooms: s.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        max_capacity: r.maxCapacity,
        allowed_class_type_ids: r.classTypes.map((ct) => ct.id),
      })),
    })),
    class_types: classTypes,
    coaches,
    history,
  };
}

async function getCoachAvailabilityWindow(
  input: { start_date: string; end_date: string },
  tenantId: string,
) {
  const start = new Date(input.start_date);
  const end = new Date(input.end_date);
  end.setHours(23, 59, 59, 999);

  // Blocks are stored with coachId = User.id. We resolve back to
  // CoachProfile.id so Spark can match them against the catalog.
  const blocks = await prisma.coachAvailabilityBlock.findMany({
    where: {
      tenantId,
      status: "active",
      OR: [
        { startDate: { lte: end }, endDate: { gte: start } },
        { startDate: { lte: end }, endDate: null },
        { startDate: null, endDate: { gte: start } },
        { startDate: null, endDate: null },
      ],
    },
    select: {
      id: true,
      coachId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      startDate: true,
      endDate: true,
      reasonType: true,
    },
  });

  const userIds = Array.from(new Set(blocks.map((b) => b.coachId)));
  const profiles = await prisma.coachProfile.findMany({
    where: { tenantId, userId: { in: userIds } },
    select: { id: true, userId: true },
  });
  const profileByUserId = new Map<string, string>(
    profiles
      .filter((p): p is { id: string; userId: string } => Boolean(p.userId))
      .map((p) => [p.userId, p.id]),
  );

  return {
    start_date: input.start_date,
    end_date: input.end_date,
    blocks: blocks.map((b) => ({
      block_id: b.id,
      coach_user_id: b.coachId,
      coach_profile_id: profileByUserId.get(b.coachId) ?? null,
      days_of_week: b.dayOfWeek,
      start_time: b.startTime,
      end_time: b.endTime,
      start_date: b.startDate?.toISOString().slice(0, 10) ?? null,
      end_date: b.endDate?.toISOString().slice(0, 10) ?? null,
      reason: b.reasonType,
    })),
  };
}

interface RawConstraints {
  studio_ids?: string[] | "all";
  horizon_days?: number;
  start_date?: string;
  excluded_windows?: {
    days_of_week?: number[];
    start_time: string;
    end_time: string;
    label?: string;
  }[];
  discipline_mix?: { class_type_id: string; name?: string; classes_per_week: number }[];
  allowed_class_type_ids?: string[] | "all";
  instructor?: {
    max_classes_per_day?: number;
    max_classes_per_week?: number;
    max_consecutive_classes?: number;
  };
  cross_studio?: {
    prevent_same_discipline_parallel?: boolean;
    coach_commute_minutes?: number;
  };
  notes?: string;
}

interface RawProposalItem {
  class_type_id: string;
  coach_id: string;
  room_id: string;
  starts_at: string;
  ends_at: string;
  rationale?: string;
}

async function proposeSchedulePlan(
  input: {
    constraints: RawConstraints;
    proposal: RawProposalItem[];
    warnings?: string[];
  },
  args: ExecutorArgs,
) {
  if (!input.proposal || input.proposal.length === 0) {
    return { error: "La propuesta está vacía" };
  }
  if (input.proposal.length > 200) {
    return { error: "Máximo 200 clases por propuesta" };
  }

  // Validate ids by hydrating names + studio. Anything not found is reported
  // back as an error rather than silently dropped so Spark can self-correct.
  const classTypeIds = unique(input.proposal.map((p) => p.class_type_id));
  const coachIds = unique(input.proposal.map((p) => p.coach_id));
  const roomIds = unique(input.proposal.map((p) => p.room_id));

  const [classTypes, coaches, rooms] = await Promise.all([
    prisma.classType.findMany({
      where: { tenantId: args.tenantId, id: { in: classTypeIds } },
      select: { id: true, name: true, duration: true },
    }),
    prisma.coachProfile.findMany({
      where: { tenantId: args.tenantId, id: { in: coachIds } },
      select: { id: true, name: true },
    }),
    prisma.room.findMany({
      where: { tenantId: args.tenantId, id: { in: roomIds } },
      include: { studio: { select: { id: true, name: true } } },
    }),
  ]);

  const classTypeById = new Map(classTypes.map((c) => [c.id, c]));
  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const errors: string[] = [];
  const proposedClasses: ProposedClass[] = [];

  for (const [idx, item] of input.proposal.entries()) {
    const ct = classTypeById.get(item.class_type_id);
    const co = coachById.get(item.coach_id);
    const rm = roomById.get(item.room_id);
    if (!ct) errors.push(`#${idx + 1}: class_type_id desconocido (${item.class_type_id})`);
    if (!co) errors.push(`#${idx + 1}: coach_id desconocido (${item.coach_id})`);
    if (!rm) errors.push(`#${idx + 1}: room_id desconocido (${item.room_id})`);
    if (!ct || !co || !rm) continue;

    const startsAt = parseIso(item.starts_at);
    const endsAt = parseIso(item.ends_at);
    if (!startsAt || !endsAt) {
      errors.push(`#${idx + 1}: fechas inválidas (${item.starts_at}, ${item.ends_at})`);
      continue;
    }
    if (endsAt <= startsAt) {
      errors.push(`#${idx + 1}: ends_at debe ser posterior a starts_at`);
      continue;
    }

    proposedClasses.push({
      classTypeId: ct.id,
      classTypeName: ct.name,
      coachId: co.id,
      coachName: co.name,
      roomId: rm.id,
      roomName: rm.name,
      studioId: rm.studio.id,
      studioName: rm.studio.name,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      rationale: item.rationale,
    });
  }

  if (proposedClasses.length === 0) {
    return {
      error: "Ninguna clase de la propuesta es válida",
      details: errors,
    };
  }

  const constraints = normaliseConstraints(input.constraints);
  const sorted = [...proposedClasses].sort(
    (a, b) => a.startsAt.localeCompare(b.startsAt),
  );
  const dates = sorted.map((c) => c.startsAt.slice(0, 10));
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const proposal: ScheduleProposal = {
    generatedAt: new Date().toISOString(),
    horizon: {
      startDate,
      endDate,
      days:
        Math.round(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
            (24 * 60 * 60 * 1000),
        ) + 1,
    },
    constraintsSnapshot: constraints,
    classes: sorted,
    warnings: [...(input.warnings ?? []), ...errors],
  };

  await prisma.schedulePlanConversation.update({
    where: { id: args.conversationId },
    data: {
      contextJson: constraints as object,
      proposalJson: proposal as unknown as object,
      status: "PROPOSED",
    },
  });

  // Summary returned to Spark — keep it terse so the model writes the
  // chat-side message itself.
  return {
    saved: true,
    total_classes: proposal.classes.length,
    span: `${startDate} → ${endDate}`,
    warnings: proposal.warnings,
    by_discipline: groupCount(proposal.classes, (c) => c.classTypeName),
    by_coach: groupCount(proposal.classes, (c) => c.coachName),
    by_studio: groupCount(proposal.classes, (c) => c.studioName),
    instruction:
      "Resume al admin que la propuesta de N clases está lista para revisar en la tabla (la UI se abre automáticamente). NO listes cada clase en el chat. Menciona los warnings si los hay.",
  };
}

function normaliseConstraints(raw: RawConstraints): PlannerConstraints {
  return {
    studioIds: raw.studio_ids,
    horizonDays: raw.horizon_days,
    startDate: raw.start_date,
    excludedWindows: raw.excluded_windows?.map((w) => ({
      daysOfWeek: w.days_of_week,
      startTime: w.start_time,
      endTime: w.end_time,
      label: w.label,
    })),
    disciplineMix: raw.discipline_mix?.map((d) => ({
      classTypeId: d.class_type_id,
      name: d.name ?? "",
      classesPerWeek: d.classes_per_week,
    })),
    allowedClassTypeIds: raw.allowed_class_type_ids,
    instructor: raw.instructor
      ? {
          maxClassesPerDay: raw.instructor.max_classes_per_day,
          maxClassesPerWeek: raw.instructor.max_classes_per_week,
          maxConsecutiveClasses: raw.instructor.max_consecutive_classes,
        }
      : undefined,
    crossStudio: raw.cross_studio
      ? {
          preventSameDisciplineParallel: raw.cross_studio.prevent_same_discipline_parallel,
          coachCommuteMinutes: raw.cross_studio.coach_commute_minutes,
        }
      : undefined,
    notes: raw.notes,
  };
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function parseIso(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function groupCount<T>(arr: T[], keyFn: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
