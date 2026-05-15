// Structured constraints Spark collects across the planning conversation.
// Stored as JSON on SchedulePlanConversation.contextJson so the next turn
// can resume with full memory of what the admin already decided.

export interface DisciplineQuota {
  classTypeId: string;
  name: string;
  classesPerWeek: number;
}

export interface InstructorConstraints {
  maxClassesPerDay?: number;
  maxClassesPerWeek?: number;
  maxConsecutiveClasses?: number;
  perCoach?: Record<string, { maxPerDay?: number; maxPerWeek?: number }>;
}

export interface CrossStudioConstraints {
  // When true, the same discipline cannot run simultaneously in two
  // different studios. Helps prevent self-cannibalisation.
  preventSameDisciplineParallel?: boolean;
  // When true, the same coach cannot teach in two studios within this
  // many minutes (commute buffer).
  coachCommuteMinutes?: number;
}

export interface ExcludedWindow {
  // Days of week the window applies to. Empty = every day.
  daysOfWeek?: number[]; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  label?: string;    // e.g. "Hora de la comida"
}

export interface PlannerConstraints {
  studioIds?: string[] | "all";
  horizonDays?: number;
  startDate?: string; // ISO YYYY-MM-DD
  excludedWindows?: ExcludedWindow[];
  disciplineMix?: DisciplineQuota[];
  allowedClassTypeIds?: string[] | "all";
  instructor?: InstructorConstraints;
  crossStudio?: CrossStudioConstraints;
  notes?: string;
}

export interface ProposedClass {
  classTypeId: string;
  classTypeName: string;
  coachId: string;
  coachName: string;
  roomId: string;
  roomName: string;
  studioId: string;
  studioName: string;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  rationale?: string;
}

export interface ScheduleProposal {
  generatedAt: string;
  horizon: { startDate: string; endDate: string; days: number };
  constraintsSnapshot: PlannerConstraints;
  classes: ProposedClass[];
  warnings: string[];
}
