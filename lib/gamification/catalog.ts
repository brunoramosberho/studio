import type {
  AchievementCategory,
  AchievementRewardType,
  AchievementTriggerType,
} from "@prisma/client";

/**
 * Catálogo de logros de sistema (tenantId = null en DB).
 * `key` es único global; coincide con el spec de gamificación.
 */
export type SystemAchievementSeed = {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  triggerType: AchievementTriggerType;
  triggerValue: number | null;
  triggerConfig?: Record<string, unknown> | null;
  rewardType?: AchievementRewardType;
  rewardValue?: Record<string, unknown> | null;
};

export type LoyaltyLevelSeed = {
  sortOrder: number;
  name: string;
  minClasses: number;
  icon: string;
  color: string;
  rewardOnUnlock?: null;
};

export const LOYALTY_LEVELS_SEED: LoyaltyLevelSeed[] = [
  {
    sortOrder: 0,
    name: "Bronce",
    minClasses: 0,
    icon: "🥉",
    color: "#CD7F32",
  },
  {
    sortOrder: 1,
    name: "Plata",
    minClasses: 10,
    icon: "🥈",
    color: "#C0C0C0",
  },
  {
    sortOrder: 2,
    name: "Oro",
    minClasses: 25,
    icon: "🥇",
    color: "#FFD700",
  },
  {
    sortOrder: 3,
    name: "Platino",
    minClasses: 50,
    icon: "💠",
    color: "#E5E4E2",
  },
  {
    sortOrder: 4,
    name: "Elite",
    minClasses: 100,
    icon: "👑",
    color: "#6366F1",
  },
];

const none = { rewardType: "NONE" as const, rewardValue: null };

export const SYSTEM_ACHIEVEMENTS_SEED: SystemAchievementSeed[] = [
  // ── Class milestones ──
  {
    key: "first_class",
    name: "Primera clase",
    description: "Completaste tu primera clase",
    icon: "🎉",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 1,
    ...none,
  },
  {
    key: "classes_5",
    name: "5 clases",
    description: "Llevas 5 clases completadas",
    icon: "⭐",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 5,
    ...none,
  },
  {
    key: "classes_10",
    name: "10 clases",
    description: "Llevas 10 clases completadas",
    icon: "🔥",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 10,
    ...none,
  },
  {
    key: "classes_25",
    name: "25 clases",
    description: "Llevas 25 clases completadas",
    icon: "💪",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 25,
    ...none,
  },
  {
    key: "classes_50",
    name: "50 clases",
    description: "Llevas 50 clases completadas",
    icon: "🏆",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 50,
    ...none,
  },
  {
    key: "classes_100",
    name: "100 clases",
    description: "Llevas 100 clases completadas",
    icon: "👑",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 100,
    ...none,
  },
  {
    key: "classes_150",
    name: "150 clases",
    description: "Llevas 150 clases completadas",
    icon: "🌟",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 150,
    ...none,
  },
  {
    key: "classes_200",
    name: "200 clases",
    description: "¡200 clases! Eres leyenda",
    icon: "💫",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 200,
    ...none,
  },
  {
    key: "classes_300",
    name: "300 clases",
    description: "300 clases completadas — nivel maestro",
    icon: "🔥",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 300,
    ...none,
  },
  {
    key: "classes_500",
    name: "500 clases",
    description: "¡Medio millar! Increíble dedicación",
    icon: "🏅",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 500,
    ...none,
  },

  // ── Day streaks ──
  {
    key: "streak_2",
    name: "Doble sesión",
    description: "2 días seguidos con clase",
    icon: "⚡",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 2,
    ...none,
  },
  {
    key: "streak_3",
    name: "Racha de 3",
    description: "3 días seguidos con clase",
    icon: "🔥",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 3,
    ...none,
  },
  {
    key: "streak_5",
    name: "Casi toda la semana",
    description: "5 días seguidos con clase",
    icon: "🌟",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 5,
    ...none,
  },
  {
    key: "streak_7",
    name: "Semana perfecta",
    description: "7 días seguidos con clase — ¡increíble!",
    icon: "💎",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 7,
    ...none,
  },

  // ── Weekly streaks (at least 1 class per week for N consecutive weeks) ──
  {
    key: "weekly_streak_2",
    name: "2 semanas al hilo",
    description: "Al menos 1 clase por semana durante 2 semanas",
    icon: "✌️",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 2,
    ...none,
  },
  {
    key: "weekly_streak_4",
    name: "1 mes constante",
    description: "Al menos 1 clase por semana durante 4 semanas",
    icon: "📅",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 4,
    ...none,
  },
  {
    key: "weekly_streak_6",
    name: "6 semanas firme",
    description: "Al menos 1 clase por semana durante 6 semanas",
    icon: "💪",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 6,
    ...none,
  },
  {
    key: "weekly_streak_8",
    name: "2 meses constante",
    description: "Al menos 1 clase por semana durante 8 semanas",
    icon: "🗓️",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 8,
    ...none,
  },
  {
    key: "weekly_streak_12",
    name: "Trimestre constante",
    description: "Al menos 1 clase por semana durante 12 semanas",
    icon: "🎯",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 12,
    ...none,
  },
  {
    key: "weekly_streak_16",
    name: "4 meses imparable",
    description: "Al menos 1 clase por semana durante 16 semanas",
    icon: "🚀",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 16,
    ...none,
  },
  {
    key: "weekly_streak_20",
    name: "5 meses dedicado",
    description: "Al menos 1 clase por semana durante 20 semanas",
    icon: "⭐",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 20,
    ...none,
  },
  {
    key: "weekly_streak_26",
    name: "Medio año constante",
    description: "Al menos 1 clase por semana durante 26 semanas",
    icon: "🏅",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 26,
    ...none,
  },
  {
    key: "weekly_streak_36",
    name: "9 meses de hierro",
    description: "Al menos 1 clase por semana durante 36 semanas",
    icon: "🏔️",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 36,
    ...none,
  },
  {
    key: "weekly_streak_52",
    name: "Un año entero",
    description: "Al menos 1 clase por semana durante 52 semanas — ¡un año!",
    icon: "👑",
    category: "STREAK",
    triggerType: "WEEKLY_STREAK",
    triggerValue: 52,
    ...none,
  },

  // ── Weekly intensity ──
  {
    key: "classes_3_week",
    name: "Semana activa",
    description: "3 clases en una sola semana",
    icon: "💪",
    category: "MILESTONE",
    triggerType: "CLASSES_IN_WEEK",
    triggerValue: 3,
    ...none,
  },
  {
    key: "week_warrior",
    name: "Guerrero semanal",
    description: "5 clases en una sola semana",
    icon: "⚔️",
    category: "MILESTONE",
    triggerType: "FIVE_CLASSES_ONE_WEEK",
    triggerValue: 5,
    ...none,
  },
  {
    key: "classes_7_week",
    name: "Semana perfecta total",
    description: "7 clases en una sola semana — ¡una al día!",
    icon: "🌈",
    category: "MILESTONE",
    triggerType: "CLASSES_IN_WEEK",
    triggerValue: 7,
    ...none,
  },

  // ── Variety ──
  {
    key: "variety_3",
    name: "Explorador",
    description: "Probaste 3 tipos de clase diferentes",
    icon: "🧭",
    category: "MILESTONE",
    triggerType: "CLASS_VARIETY",
    triggerValue: 3,
    ...none,
  },
  {
    key: "variety_5",
    name: "Todoterreno",
    description: "Probaste 5 tipos de clase diferentes",
    icon: "🌀",
    category: "MILESTONE",
    triggerType: "CLASS_VARIETY",
    triggerValue: 5,
    ...none,
  },

  // ── Comeback ──
  {
    key: "comeback",
    name: "De vuelta",
    description: "Regresaste después de 30 o más días de ausencia",
    icon: "🔄",
    category: "MILESTONE",
    triggerType: "COMEBACK",
    triggerValue: 30,
    ...none,
  },

  // ── Special moments ──
  {
    key: "birthday",
    name: "Feliz cumpleaños",
    description: "¡Celebramos contigo en tu día!",
    icon: "🎂",
    category: "BIRTHDAY",
    triggerType: "BIRTHDAY",
    triggerValue: null,
    ...none,
  },
  {
    key: "birthday_class",
    name: "Clase de cumpleaños",
    description: "Tomaste una clase el día de tu cumpleaños",
    icon: "🎁",
    category: "BIRTHDAY",
    triggerType: "BIRTHDAY_CLASS",
    triggerValue: null,
    ...none,
  },
  {
    key: "early_bird",
    name: "Madrugador",
    description: "Tomaste una clase antes de las 7:00",
    icon: "🌅",
    category: "MILESTONE",
    triggerType: "FIRST_7AM_CLASS",
    triggerValue: null,
    ...none,
  },
  {
    key: "night_owl",
    name: "Noctámbulo",
    description: "Tomaste una clase a las 21:00 o después",
    icon: "🌙",
    category: "MILESTONE",
    triggerType: "FIRST_9PM_CLASS",
    triggerValue: null,
    ...none,
  },

  // ── Social ──
  {
    key: "first_referral",
    name: "Embajador",
    description: "Tu primer referido se unió al estudio",
    icon: "🤝",
    category: "SOCIAL",
    triggerType: "REFERRAL",
    triggerValue: 1,
    ...none,
  },

];

/** Mapeo desde claves legacy (UserAchievement.achievementType) → key del catálogo */
export const LEGACY_ACHIEVEMENT_KEY_MAP: Record<string, string> = {
  FIRST_CLASS: "first_class",
  MILESTONE_5: "classes_5",
  MILESTONE_10: "classes_10",
  MILESTONE_25: "classes_25",
  MILESTONE_50: "classes_50",
  MILESTONE_100: "classes_100",
  STREAK_7: "streak_7",
  STREAK_30: "streak_3",
  EARLY_BIRD: "early_bird",
  NIGHT_OWL: "night_owl",
  WEEK_WARRIOR: "week_warrior",
};

/** Clave de catálogo → tipo en payload del feed (compat con AchievementBadge / eventos viejos) */
export const KEY_TO_FEED_ACHIEVEMENT_TYPE: Record<string, string> = {
  first_class: "FIRST_CLASS",
  classes_5: "MILESTONE_5",
  classes_10: "MILESTONE_10",
  classes_25: "MILESTONE_25",
  classes_50: "MILESTONE_50",
  classes_100: "MILESTONE_100",
  classes_150: "MILESTONE_150",
  classes_200: "MILESTONE_200",
  classes_300: "MILESTONE_300",
  classes_500: "MILESTONE_500",
  streak_2: "STREAK_2",
  streak_3: "STREAK_3",
  streak_5: "STREAK_5",
  streak_7: "STREAK_7",
  weekly_streak_2: "WEEKLY_STREAK_2",
  weekly_streak_4: "WEEKLY_STREAK_4",
  weekly_streak_6: "WEEKLY_STREAK_6",
  weekly_streak_8: "WEEKLY_STREAK_8",
  weekly_streak_12: "WEEKLY_STREAK_12",
  weekly_streak_16: "WEEKLY_STREAK_16",
  weekly_streak_20: "WEEKLY_STREAK_20",
  weekly_streak_26: "WEEKLY_STREAK_26",
  weekly_streak_36: "WEEKLY_STREAK_36",
  weekly_streak_52: "WEEKLY_STREAK_52",
  classes_3_week: "CLASSES_3_WEEK",
  classes_7_week: "CLASSES_7_WEEK",
  variety_3: "VARIETY_3",
  variety_5: "VARIETY_5",
  comeback: "COMEBACK",
  birthday: "BIRTHDAY",
  birthday_class: "BIRTHDAY_CLASS",
  early_bird: "EARLY_BIRD",
  night_owl: "NIGHT_OWL",
  week_warrior: "WEEK_WARRIOR",
  first_referral: "FIRST_REFERRAL",
};

export function feedAchievementTypeFromKey(key: string): string {
  return KEY_TO_FEED_ACHIEVEMENT_TYPE[key] ?? key.toUpperCase();
}
