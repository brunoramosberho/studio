export interface Discipline {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

export interface Coach {
  id: string;
  name: string;
  avatar_url?: string;
  color: string;
  disciplines: Array<{
    discipline: Discipline;
    is_primary: boolean;
  }>;
}

export interface ScheduleSlot {
  day_of_week: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  time: string;
  discipline_id: string;
  coach_id: string;
}

export interface OccupancyCell {
  day: number;
  hour: string;
  avg_occupancy: number;
  class_count: number;
}

export interface CoachMetrics {
  coach_id: string;
  occupancy_rate: number;
  retention_rate: number;
  unique_students: number;
  classes_held: number;
  no_show_rate: number;
  revenue: number;
  trend: number[];
  punctuality: number;
  repeat_students: number;
  avg_rating?: number;
  by_discipline: Record<
    string,
    {
      occupancy_rate: number;
      retention_rate: number;
      unique_students: number;
    }
  >;
  by_slot: Array<{
    day: number;
    time: string;
    avg_occupancy: number;
  }>;
}

export interface KpiData {
  occupancy_rate: number;
  occupancy_delta: number;
  active_students_count: number;
  active_students_delta: number;
  classes_held: number;
  classes_held_delta: number;
  retention_rate: number;
  retention_delta: number;
}

export interface CrossCombination {
  coach: Coach;
  time: string;
  day: number;
  occupancy: number;
  insight: string;
}

export interface AnalyticsData {
  kpis: KpiData;
  occupancy_grid: OccupancyCell[];
  coaches: Coach[];
  coach_metrics: CoachMetrics[];
  disciplines: Discipline[];
  schedule_slots: ScheduleSlot[];
  cross_combinations: CrossCombination[];
}

export type Period = "week" | "month" | "quarter";
