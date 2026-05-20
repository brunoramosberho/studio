import { prisma } from "@/lib/db";
import { getWallClockInZone } from "@/lib/utils";
import type {
  AnalyticsData,
  Coach,
  CoachMetrics,
  CrossCombination,
  Discipline,
  KpiData,
  OccupancyCell,
  Period,
  ScheduleSlot,
} from "./types";

interface GetAnalyticsOptions {
  period: Period;
  disciplineId?: string;
  now?: Date;
}

const PERIOD_DAYS: Record<Period, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

const TREND_BUCKETS = 8;
const FALLBACK_TIMEZONE = "Europe/Madrid";

type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface ClassWithRelations {
  id: string;
  startsAt: Date;
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  classTypeId: string;
  coachId: string;
  classType: { name: string; color: string; icon: string | null };
  coach: { id: string; name: string; color: string; photoUrl: string | null };
  room: {
    maxCapacity: number;
    studio: { city: { timezone: string } | null } | null;
  };
  bookings: Array<{
    status: "CONFIRMED" | "CANCELLED" | "ATTENDED" | "NO_SHOW";
    userId: string | null;
    imputedValueCents: number | null;
  }>;
  ratings: Array<{ rating: number }>;
}

// Convert JS getDay() (0=Sun..6=Sat) to our (0=Mon..6=Sun) convention.
function toMondayFirst(weekday: number): DayIndex {
  return (((weekday + 6) % 7) as DayIndex);
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function pct(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((num / denom) * 100);
}

function delta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

function bucketLocalSlot(
  startsAt: Date,
  tz: string,
): { day: DayIndex; hour: string } {
  const wc = getWallClockInZone(startsAt, tz);
  const day = toMondayFirst(wc.weekday);
  const hour = `${String(wc.hour).padStart(2, "0")}:00`;
  return { day, hour };
}

function activeBookings(
  bookings: ClassWithRelations["bookings"],
): number {
  return bookings.filter(
    (b) => b.status === "CONFIRMED" || b.status === "ATTENDED",
  ).length;
}

/**
 * Compute per-class occupancy. Capped at 100 in case overbooking exists.
 */
function classOccupancy(c: ClassWithRelations): number {
  const cap = Math.max(c.room.maxCapacity, 1);
  return Math.min(100, Math.round((activeBookings(c.bookings) / cap) * 100));
}

function isCountableForOccupancy(c: ClassWithRelations): boolean {
  return c.status !== "CANCELLED";
}

async function resolveTenantTimezone(tenantId: string): Promise<string> {
  const studio = await prisma.studio.findFirst({
    where: { tenantId },
    orderBy: { id: "asc" },
    select: { city: { select: { timezone: true } } },
  });
  return studio?.city?.timezone ?? FALLBACK_TIMEZONE;
}

export async function getAnalytics(
  tenantId: string,
  opts: GetAnalyticsOptions,
): Promise<AnalyticsData> {
  const now = opts.now ?? new Date();
  const days = PERIOD_DAYS[opts.period];

  const currentStart = startOfDay(new Date(now.getTime() - days * 86400000));
  const previousStart = startOfDay(
    new Date(now.getTime() - 2 * days * 86400000),
  );

  const tz = await resolveTenantTimezone(tenantId);

  const classesWhere = {
    tenantId,
    startsAt: { gte: previousStart, lte: now },
    ...(opts.disciplineId ? { classTypeId: opts.disciplineId } : {}),
  };

  const [classes, classTypes, coachProfiles] = await Promise.all([
    prisma.class.findMany({
      where: classesWhere,
      select: {
        id: true,
        startsAt: true,
        status: true,
        classTypeId: true,
        coachId: true,
        classType: { select: { name: true, color: true, icon: true } },
        coach: {
          select: { id: true, name: true, color: true, photoUrl: true },
        },
        room: {
          select: {
            maxCapacity: true,
            studio: { select: { city: { select: { timezone: true } } } },
          },
        },
        bookings: {
          select: {
            status: true,
            userId: true,
            imputedValueCents: true,
          },
        },
        ratings: { select: { rating: true } },
      },
    }) as Promise<ClassWithRelations[]>,
    prisma.classType.findMany({
      where: { tenantId },
      select: { id: true, name: true, color: true, icon: true },
      orderBy: { name: "asc" },
    }),
    prisma.coachProfile.findMany({
      where: { tenantId },
      select: { id: true, name: true, color: true, photoUrl: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const currentClasses = classes.filter((c) => c.startsAt >= currentStart);
  const previousClasses = classes.filter((c) => c.startsAt < currentStart);

  const disciplines: Discipline[] = classTypes.map((ct) => ({
    id: ct.id,
    name: ct.name,
    color: ct.color,
    icon: ct.icon ?? undefined,
  }));

  // Coach.disciplines is derived from what each coach actually taught in the
  // current period. The most-taught discipline is marked as primary.
  const coachDisciplineCounts = new Map<string, Map<string, number>>();
  for (const c of currentClasses) {
    let inner = coachDisciplineCounts.get(c.coachId);
    if (!inner) {
      inner = new Map();
      coachDisciplineCounts.set(c.coachId, inner);
    }
    inner.set(c.classTypeId, (inner.get(c.classTypeId) ?? 0) + 1);
  }

  const disciplinesById = new Map(disciplines.map((d) => [d.id, d]));
  const coaches: Coach[] = coachProfiles
    .map((cp): Coach | null => {
      const counts = coachDisciplineCounts.get(cp.id);
      if (!counts || counts.size === 0) return null;
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const coachDisciplines = ranked
        .map(([discId], i) => {
          const d = disciplinesById.get(discId);
          if (!d) return null;
          return { discipline: d, is_primary: i === 0 };
        })
        .filter((x): x is { discipline: Discipline; is_primary: boolean } =>
          x != null,
        );
      if (coachDisciplines.length === 0) return null;
      return {
        id: cp.id,
        name: cp.name,
        color: cp.color,
        avatar_url: cp.photoUrl ?? undefined,
        disciplines: coachDisciplines,
      };
    })
    .filter((c): c is Coach => c !== null);

  // Build schedule_slots — distinct (day, time, discipline, coach) tuples
  // observed in the current period. Used by the heatmap to know which cells
  // to show.
  const slotSeen = new Set<string>();
  const scheduleSlots: ScheduleSlot[] = [];
  for (const c of currentClasses) {
    const classTz = c.room.studio?.city?.timezone ?? tz;
    const { day, hour } = bucketLocalSlot(c.startsAt, classTz);
    const key = `${day}-${hour}-${c.classTypeId}-${c.coachId}`;
    if (slotSeen.has(key)) continue;
    slotSeen.add(key);
    scheduleSlots.push({
      day_of_week: day,
      time: hour,
      discipline_id: c.classTypeId,
      coach_id: c.coachId,
    });
  }

  // ── Occupancy grid (day × hour) ──
  const cellAcc = new Map<
    string,
    { day: DayIndex; hour: string; total: number; count: number }
  >();
  for (const c of currentClasses) {
    if (!isCountableForOccupancy(c)) continue;
    const classTz = c.room.studio?.city?.timezone ?? tz;
    const { day, hour } = bucketLocalSlot(c.startsAt, classTz);
    const key = `${day}-${hour}`;
    const entry = cellAcc.get(key) ?? { day, hour, total: 0, count: 0 };
    entry.total += classOccupancy(c);
    entry.count += 1;
    cellAcc.set(key, entry);
  }
  const occupancyGrid: OccupancyCell[] = [...cellAcc.values()].map((e) => ({
    day: e.day,
    hour: e.hour,
    avg_occupancy: Math.round(e.total / e.count),
    class_count: e.count,
  }));

  // ── KPIs ──
  const kpis = computeKpis(currentClasses, previousClasses);

  // ── Per-coach metrics ──
  const coachMetrics: CoachMetrics[] = coaches.map((coach) =>
    computeCoachMetrics(coach, currentClasses, currentStart, days, tz),
  );

  // ── Cross combinations (only when a discipline is selected) ──
  const crossCombinations: CrossCombination[] = opts.disciplineId
    ? computeCrossCombinations(currentClasses, coaches, tz, occupancyGrid)
    : [];

  return {
    kpis,
    occupancy_grid: occupancyGrid,
    coaches,
    coach_metrics: coachMetrics,
    disciplines,
    schedule_slots: scheduleSlots,
    cross_combinations: crossCombinations,
  };
}

function computeKpis(
  current: ClassWithRelations[],
  previous: ClassWithRelations[],
): KpiData {
  const occCurrent = avgOccupancy(current);
  const occPrev = avgOccupancy(previous);

  const studentsCurrent = uniqueAttendees(current).size;
  const studentsPrev = uniqueAttendees(previous).size;

  const classesCurrent = current.filter((c) => c.status === "COMPLETED").length;
  const classesPrev = previous.filter((c) => c.status === "COMPLETED").length;

  const retentionCurrent = retentionRate(current);
  const retentionPrev = retentionRate(previous);

  return {
    occupancy_rate: occCurrent,
    occupancy_delta: delta(occCurrent, occPrev),
    active_students_count: studentsCurrent,
    active_students_delta: delta(studentsCurrent, studentsPrev),
    classes_held: classesCurrent,
    classes_held_delta: delta(classesCurrent, classesPrev),
    retention_rate: retentionCurrent,
    retention_delta: delta(retentionCurrent, retentionPrev),
  };
}

function avgOccupancy(classes: ClassWithRelations[]): number {
  const eligible = classes.filter(isCountableForOccupancy);
  if (eligible.length === 0) return 0;
  const total = eligible.reduce((s, c) => s + classOccupancy(c), 0);
  return Math.round(total / eligible.length);
}

function uniqueAttendees(classes: ClassWithRelations[]): Set<string> {
  const set = new Set<string>();
  for (const c of classes) {
    for (const b of c.bookings) {
      if (!b.userId) continue;
      if (b.status === "CONFIRMED" || b.status === "ATTENDED") {
        set.add(b.userId);
      }
    }
  }
  return set;
}

/**
 * Retention rate = % of attendees in the window who attended ≥2 classes.
 * Approximates the "did they come back" question without requiring a longer
 * follow-up window.
 */
function retentionRate(classes: ClassWithRelations[]): number {
  const counts = new Map<string, number>();
  for (const c of classes) {
    for (const b of c.bookings) {
      if (!b.userId) continue;
      if (b.status !== "ATTENDED") continue;
      counts.set(b.userId, (counts.get(b.userId) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return 0;
  const repeat = [...counts.values()].filter((n) => n >= 2).length;
  return pct(repeat, counts.size);
}

function computeCoachMetrics(
  coach: Coach,
  classes: ClassWithRelations[],
  currentStart: Date,
  periodDays: number,
  fallbackTz: string,
): CoachMetrics {
  const coachClasses = classes.filter((c) => c.coachId === coach.id);

  const countable = coachClasses.filter(isCountableForOccupancy);
  const occupancyRate = countable.length
    ? Math.round(
        countable.reduce((s, c) => s + classOccupancy(c), 0) / countable.length,
      )
    : 0;

  const attendanceCounts = new Map<string, number>();
  let confirmedOrAttended = 0;
  let noShow = 0;
  let revenueCents = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  for (const c of coachClasses) {
    for (const r of c.ratings) {
      ratingSum += r.rating;
      ratingCount += 1;
    }
    for (const b of c.bookings) {
      if (b.status === "CONFIRMED" || b.status === "ATTENDED") {
        confirmedOrAttended += 1;
      }
      if (b.status === "NO_SHOW") noShow += 1;
      if (b.status === "ATTENDED" && b.userId) {
        attendanceCounts.set(
          b.userId,
          (attendanceCounts.get(b.userId) ?? 0) + 1,
        );
      }
      if (b.imputedValueCents) revenueCents += b.imputedValueCents;
    }
  }

  const uniqueStudents = attendanceCounts.size;
  const repeatStudents = [...attendanceCounts.values()].filter(
    (n) => n >= 2,
  ).length;
  const retention = uniqueStudents ? pct(repeatStudents, uniqueStudents) : 0;
  const noShowRate = pct(noShow, confirmedOrAttended + noShow);

  // Fulfillment rate — % of scheduled classes that actually ran. Exposed via
  // the `punctuality` field on the radar; renamed accordingly in the UI copy.
  const scheduled = coachClasses.length;
  const completed = coachClasses.filter((c) => c.status !== "CANCELLED").length;
  const fulfillment = scheduled ? pct(completed, scheduled) : 0;

  const classesHeld = coachClasses.filter(
    (c) => c.status === "COMPLETED",
  ).length;

  // Trend — 8 equal sub-buckets across the current period.
  const trend = computeTrend(coachClasses, currentStart, periodDays);

  // By discipline
  const byDiscipline: CoachMetrics["by_discipline"] = {};
  const grouped = new Map<string, ClassWithRelations[]>();
  for (const c of coachClasses) {
    const arr = grouped.get(c.classTypeId) ?? [];
    arr.push(c);
    grouped.set(c.classTypeId, arr);
  }
  for (const [discId, list] of grouped) {
    const eligibleList = list.filter(isCountableForOccupancy);
    const dOcc = eligibleList.length
      ? Math.round(
          eligibleList.reduce((s, c) => s + classOccupancy(c), 0) /
            eligibleList.length,
        )
      : 0;
    const dAttCounts = new Map<string, number>();
    for (const c of list) {
      for (const b of c.bookings) {
        if (b.status === "ATTENDED" && b.userId) {
          dAttCounts.set(b.userId, (dAttCounts.get(b.userId) ?? 0) + 1);
        }
      }
    }
    const dUnique = dAttCounts.size;
    const dRepeat = [...dAttCounts.values()].filter((n) => n >= 2).length;
    byDiscipline[discId] = {
      occupancy_rate: dOcc,
      retention_rate: dUnique ? pct(dRepeat, dUnique) : 0,
      unique_students: dUnique,
    };
  }

  // By slot — per (day, time) pair, avg occupancy.
  const slotAcc = new Map<
    string,
    { day: DayIndex; time: string; total: number; count: number }
  >();
  for (const c of coachClasses) {
    if (!isCountableForOccupancy(c)) continue;
    const classTz = c.room.studio?.city?.timezone ?? fallbackTz;
    const { day, hour } = bucketLocalSlot(c.startsAt, classTz);
    const key = `${day}-${hour}`;
    const entry = slotAcc.get(key) ?? { day, time: hour, total: 0, count: 0 };
    entry.total += classOccupancy(c);
    entry.count += 1;
    slotAcc.set(key, entry);
  }
  const bySlot: CoachMetrics["by_slot"] = [...slotAcc.values()].map((e) => ({
    day: e.day,
    time: e.time,
    avg_occupancy: Math.round(e.total / e.count),
  }));

  return {
    coach_id: coach.id,
    occupancy_rate: occupancyRate,
    retention_rate: retention,
    unique_students: uniqueStudents,
    classes_held: classesHeld,
    no_show_rate: noShowRate,
    revenue: Math.round(revenueCents / 100),
    trend,
    punctuality: fulfillment,
    repeat_students: repeatStudents,
    avg_rating: ratingCount ? ratingSum / ratingCount : undefined,
    by_discipline: byDiscipline,
    by_slot: bySlot,
  };
}

function computeTrend(
  coachClasses: ClassWithRelations[],
  currentStart: Date,
  periodDays: number,
): number[] {
  const bucketSizeMs = (periodDays * 86400000) / TREND_BUCKETS;
  const buckets: { total: number; count: number }[] = Array.from(
    { length: TREND_BUCKETS },
    () => ({ total: 0, count: 0 }),
  );
  for (const c of coachClasses) {
    if (!isCountableForOccupancy(c)) continue;
    const offset = c.startsAt.getTime() - currentStart.getTime();
    if (offset < 0) continue;
    const idx = Math.min(
      TREND_BUCKETS - 1,
      Math.floor(offset / bucketSizeMs),
    );
    buckets[idx].total += classOccupancy(c);
    buckets[idx].count += 1;
  }
  return buckets.map((b) => (b.count ? Math.round(b.total / b.count) : 0));
}

function computeCrossCombinations(
  classes: ClassWithRelations[],
  coaches: Coach[],
  fallbackTz: string,
  studioGrid: OccupancyCell[],
): CrossCombination[] {
  const studioByCell = new Map<string, number>();
  for (const cell of studioGrid) {
    studioByCell.set(`${cell.day}-${cell.hour}`, cell.avg_occupancy);
  }

  type Acc = {
    day: DayIndex;
    hour: string;
    coachId: string;
    total: number;
    count: number;
  };
  const acc = new Map<string, Acc>();
  for (const c of classes) {
    if (!isCountableForOccupancy(c)) continue;
    const classTz = c.room.studio?.city?.timezone ?? fallbackTz;
    const { day, hour } = bucketLocalSlot(c.startsAt, classTz);
    const key = `${c.coachId}-${day}-${hour}`;
    const entry = acc.get(key) ?? {
      day,
      hour,
      coachId: c.coachId,
      total: 0,
      count: 0,
    };
    entry.total += classOccupancy(c);
    entry.count += 1;
    acc.set(key, entry);
  }

  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const combos: CrossCombination[] = [];
  for (const e of acc.values()) {
    const coach = coachById.get(e.coachId);
    if (!coach) continue;
    const occ = Math.round(e.total / e.count);
    const studioAvg = studioByCell.get(`${e.day}-${e.hour}`) ?? occ;
    const diff = occ - studioAvg;
    const insight =
      diff > 10
        ? `Un ${diff}% por encima de la media del estudio en ese slot`
        : diff > 0
          ? `Por encima del promedio del estudio en ese horario`
          : diff === 0
            ? `En línea con el promedio del estudio`
            : `${Math.abs(diff)}% por debajo del promedio del estudio`;
    combos.push({
      coach,
      time: e.hour,
      day: e.day,
      occupancy: occ,
      insight,
    });
  }

  return combos.sort((a, b) => b.occupancy - a.occupancy).slice(0, 4);
}
