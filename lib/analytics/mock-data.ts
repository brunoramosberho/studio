import type {
  Discipline,
  Coach,
  ScheduleSlot,
  OccupancyCell,
  CoachMetrics,
  KpiData,
  CrossCombination,
  AnalyticsData,
} from "./types";

const disciplines: Discipline[] = [
  { id: "d1", name: "Reformer", color: "#6366F1", icon: "Dumbbell" },
  { id: "d2", name: "Barre", color: "#EC4899", icon: "Music" },
  { id: "d3", name: "Yoga", color: "#10B981", icon: "Leaf" },
];

const coaches: Coach[] = [
  {
    id: "c1",
    name: "Valentina Reyes",
    color: "#6366F1",
    disciplines: [
      { discipline: disciplines[0], is_primary: true },
      { discipline: disciplines[1], is_primary: false },
    ],
  },
  {
    id: "c2",
    name: "Marco Díaz",
    color: "#F59E0B",
    disciplines: [{ discipline: disciplines[0], is_primary: true }],
  },
  {
    id: "c3",
    name: "Camila Soto",
    color: "#EC4899",
    disciplines: [
      { discipline: disciplines[1], is_primary: true },
      { discipline: disciplines[2], is_primary: false },
    ],
  },
  {
    id: "c4",
    name: "Diego Herrera",
    color: "#10B981",
    disciplines: [{ discipline: disciplines[2], is_primary: true }],
  },
];

const HOURS = [
  "07:00", "08:00", "09:00", "10:00", "11:00",
  "12:00", "14:00", "16:00", "17:00", "18:00", "19:00", "20:00",
];

const scheduleSlots: ScheduleSlot[] = [
  // Valentina - mornings great, afternoons ok (Reformer + Barre)
  { day_of_week: 0, time: "07:00", discipline_id: "d1", coach_id: "c1" },
  { day_of_week: 0, time: "09:00", discipline_id: "d1", coach_id: "c1" },
  { day_of_week: 1, time: "07:00", discipline_id: "d1", coach_id: "c1" },
  { day_of_week: 1, time: "18:00", discipline_id: "d2", coach_id: "c1" },
  { day_of_week: 2, time: "08:00", discipline_id: "d1", coach_id: "c1" },
  { day_of_week: 2, time: "10:00", discipline_id: "d2", coach_id: "c1" },
  { day_of_week: 3, time: "07:00", discipline_id: "d1", coach_id: "c1" },
  { day_of_week: 3, time: "17:00", discipline_id: "d2", coach_id: "c1" },
  { day_of_week: 4, time: "09:00", discipline_id: "d1", coach_id: "c1" },
  { day_of_week: 5, time: "08:00", discipline_id: "d1", coach_id: "c1" },
  { day_of_week: 5, time: "10:00", discipline_id: "d2", coach_id: "c1" },

  // Marco - only mornings, poor afternoons (Reformer only)
  { day_of_week: 0, time: "08:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 0, time: "16:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 1, time: "09:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 2, time: "07:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 2, time: "16:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 3, time: "08:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 4, time: "07:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 4, time: "17:00", discipline_id: "d1", coach_id: "c2" },
  { day_of_week: 5, time: "09:00", discipline_id: "d1", coach_id: "c2" },

  // Camila - consistent all day (Barre + Yoga)
  { day_of_week: 0, time: "10:00", discipline_id: "d2", coach_id: "c3" },
  { day_of_week: 0, time: "18:00", discipline_id: "d3", coach_id: "c3" },
  { day_of_week: 1, time: "10:00", discipline_id: "d2", coach_id: "c3" },
  { day_of_week: 1, time: "19:00", discipline_id: "d3", coach_id: "c3" },
  { day_of_week: 2, time: "11:00", discipline_id: "d2", coach_id: "c3" },
  { day_of_week: 2, time: "18:00", discipline_id: "d3", coach_id: "c3" },
  { day_of_week: 3, time: "10:00", discipline_id: "d2", coach_id: "c3" },
  { day_of_week: 3, time: "19:00", discipline_id: "d3", coach_id: "c3" },
  { day_of_week: 4, time: "11:00", discipline_id: "d2", coach_id: "c3" },
  { day_of_week: 4, time: "18:00", discipline_id: "d3", coach_id: "c3" },
  { day_of_week: 5, time: "10:00", discipline_id: "d2", coach_id: "c3" },

  // Diego - Yoga, afternoons weak
  { day_of_week: 0, time: "07:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 0, time: "19:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 1, time: "08:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 1, time: "20:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 2, time: "09:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 3, time: "07:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 3, time: "14:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 4, time: "08:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 4, time: "20:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 5, time: "07:00", discipline_id: "d3", coach_id: "c4" },
  { day_of_week: 5, time: "12:00", discipline_id: "d3", coach_id: "c4" },
];

function buildOccupancyGrid(disciplineId?: string): OccupancyCell[] {
  const filtered = disciplineId
    ? scheduleSlots.filter((s) => s.discipline_id === disciplineId)
    : scheduleSlots;

  const grouped = new Map<string, ScheduleSlot[]>();
  for (const slot of filtered) {
    const key = `${slot.day_of_week}-${slot.time}`;
    const list = grouped.get(key) ?? [];
    list.push(slot);
    grouped.set(key, list);
  }

  const occupancyMap: Record<string, number> = {
    "07:00": 92, "08:00": 88, "09:00": 95, "10:00": 82,
    "11:00": 78, "12:00": 65, "14:00": 58, "16:00": 55,
    "17:00": 72, "18:00": 85, "19:00": 79, "20:00": 62,
  };

  const dayModifiers = [1.0, 0.95, 1.02, 0.98, 0.93, 0.88];

  const cells: OccupancyCell[] = [];
  for (const [key, slots] of grouped) {
    const [dayStr, hour] = key.split("-");
    const day = parseInt(dayStr);
    const base = occupancyMap[hour] ?? 70;
    const modifier = dayModifiers[day] ?? 1;
    const jitter = (Math.sin(day * 7 + parseInt(hour) * 3) * 8);
    const occ = Math.min(100, Math.max(30, Math.round(base * modifier + jitter)));

    cells.push({
      day,
      hour,
      avg_occupancy: occ,
      class_count: slots.length * (disciplineId ? 3 : 4),
    });
  }

  return cells;
}

function buildCoachMetrics(disciplineId?: string): CoachMetrics[] {
  const metrics: Omit<CoachMetrics, "by_slot">[] = [
    {
      coach_id: "c1",
      occupancy_rate: 91,
      retention_rate: 78,
      unique_students: 64,
      classes_held: 42,
      no_show_rate: 5,
      revenue: 18200,
      punctuality: 96,
      repeat_students: 38,
      avg_rating: 4.8,
      trend: [85, 87, 88, 90, 89, 92, 91, 93],
      by_discipline: {
        d1: { occupancy_rate: 93, retention_rate: 80, unique_students: 45 },
        d2: { occupancy_rate: 86, retention_rate: 72, unique_students: 28 },
      },
    },
    {
      coach_id: "c2",
      occupancy_rate: 74,
      retention_rate: 62,
      unique_students: 38,
      classes_held: 35,
      no_show_rate: 12,
      revenue: 11500,
      punctuality: 82,
      repeat_students: 15,
      avg_rating: 4.2,
      trend: [70, 72, 68, 75, 73, 76, 74, 71],
      by_discipline: {
        d1: { occupancy_rate: 74, retention_rate: 62, unique_students: 38 },
      },
    },
    {
      coach_id: "c3",
      occupancy_rate: 85,
      retention_rate: 81,
      unique_students: 52,
      classes_held: 38,
      no_show_rate: 4,
      revenue: 15800,
      punctuality: 98,
      repeat_students: 34,
      avg_rating: 4.9,
      trend: [78, 80, 82, 83, 85, 84, 86, 87],
      by_discipline: {
        d2: { occupancy_rate: 88, retention_rate: 83, unique_students: 35 },
        d3: { occupancy_rate: 80, retention_rate: 77, unique_students: 24 },
      },
    },
    {
      coach_id: "c4",
      occupancy_rate: 68,
      retention_rate: 70,
      unique_students: 30,
      classes_held: 30,
      no_show_rate: 8,
      revenue: 9200,
      punctuality: 90,
      repeat_students: 18,
      avg_rating: 4.5,
      trend: [60, 62, 65, 63, 67, 66, 68, 70],
      by_discipline: {
        d3: { occupancy_rate: 68, retention_rate: 70, unique_students: 30 },
      },
    },
  ];

  if (disciplineId) {
    return metrics
      .filter((m) => {
        const coach = coaches.find((c) => c.id === m.coach_id);
        return coach?.disciplines.some((d) => d.discipline.id === disciplineId);
      })
      .map((m) => {
        const disc = m.by_discipline[disciplineId];
        return {
          ...m,
          occupancy_rate: disc?.occupancy_rate ?? m.occupancy_rate,
          retention_rate: disc?.retention_rate ?? m.retention_rate,
          unique_students: disc?.unique_students ?? m.unique_students,
          by_slot: buildCoachSlots(m.coach_id, disciplineId),
        };
      });
  }

  return metrics.map((m) => ({
    ...m,
    by_slot: buildCoachSlots(m.coach_id),
  }));
}

function buildCoachSlots(
  coachId: string,
  disciplineId?: string,
): CoachMetrics["by_slot"] {
  const coachSlots = scheduleSlots.filter(
    (s) =>
      s.coach_id === coachId &&
      (!disciplineId || s.discipline_id === disciplineId),
  );

  const occupancyByTime: Record<string, number> = {
    "07:00": 92, "08:00": 90, "09:00": 95, "10:00": 83,
    "11:00": 78, "12:00": 65, "14:00": 55, "16:00": 52,
    "17:00": 70, "18:00": 84, "19:00": 76, "20:00": 60,
  };

  const coachModifiers: Record<string, number> = {
    c1: 1.05, c2: 0.85, c3: 1.0, c4: 0.9,
  };

  const seen = new Set<string>();
  return coachSlots
    .filter((s) => {
      const key = `${s.day_of_week}-${s.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((s) => {
      const base = occupancyByTime[s.time] ?? 70;
      const mod = coachModifiers[s.coach_id] ?? 1;
      const jitter = Math.sin(s.day_of_week * 5 + parseInt(s.time) * 2) * 6;
      return {
        day: s.day_of_week,
        time: s.time,
        avg_occupancy: Math.min(100, Math.max(30, Math.round(base * mod + jitter))),
      };
    });
}

function buildCrossCombinations(disciplineId: string): CrossCombination[] {
  const relevantSlots = scheduleSlots.filter(
    (s) => s.discipline_id === disciplineId,
  );

  const combinations: CrossCombination[] = [];
  const seenCoachTime = new Set<string>();

  for (const slot of relevantSlots) {
    const key = `${slot.coach_id}-${slot.time}`;
    if (seenCoachTime.has(key)) continue;
    seenCoachTime.add(key);

    const coach = coaches.find((c) => c.id === slot.coach_id)!;
    const base: Record<string, number> = {
      "07:00": 94, "08:00": 91, "09:00": 96, "10:00": 84,
      "11:00": 79, "12:00": 66, "14:00": 56, "16:00": 53,
      "17:00": 71, "18:00": 86, "19:00": 78, "20:00": 61,
    };
    const coachMod: Record<string, number> = {
      c1: 1.05, c2: 0.82, c3: 1.02, c4: 0.88,
    };
    const occ = Math.min(
      100,
      Math.round(
        (base[slot.time] ?? 70) * (coachMod[slot.coach_id] ?? 1),
      ),
    );

    const studioAvg = base[slot.time] ?? 70;
    const diff = occ - studioAvg;
    const insight =
      diff > 10
        ? `Un ${diff}% por encima de la media del estudio en ese slot`
        : diff > 0
          ? `Es el horario donde más llena sus clases`
          : `Tiene margen de mejora en este horario`;

    combinations.push({
      coach,
      time: slot.time,
      day: slot.day_of_week,
      occupancy: occ,
      insight,
    });
  }

  return combinations
    .sort((a, b) => b.occupancy - a.occupancy)
    .slice(0, 4);
}

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function getDayName(day: number): string {
  return DAY_NAMES[day] ?? "—";
}

export function getMockAnalytics(
  disciplineId?: string,
  _period?: string,
): AnalyticsData {
  const grid = buildOccupancyGrid(disciplineId);
  const coachMetrics = buildCoachMetrics(disciplineId);

  const avgOcc =
    grid.length > 0
      ? Math.round(grid.reduce((s, c) => s + c.avg_occupancy, 0) / grid.length)
      : 0;

  const kpis: KpiData = {
    occupancy_rate: avgOcc,
    occupancy_delta: 5,
    active_students_count: disciplineId ? 72 : 148,
    active_students_delta: 12,
    classes_held: disciplineId ? 45 : 145,
    classes_held_delta: 3,
    retention_rate: 74,
    retention_delta: -2,
  };

  return {
    kpis,
    occupancy_grid: grid,
    coaches,
    coach_metrics: coachMetrics,
    disciplines,
    schedule_slots: disciplineId
      ? scheduleSlots.filter((s) => s.discipline_id === disciplineId)
      : scheduleSlots,
    cross_combinations: disciplineId
      ? buildCrossCombinations(disciplineId)
      : [],
  };
}

export { disciplines, coaches, HOURS, DAY_NAMES };
