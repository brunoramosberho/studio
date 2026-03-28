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
  rewardType: AchievementRewardType;
  rewardValue?: Record<string, unknown> | null;
};

export type LoyaltyLevelSeed = {
  sortOrder: number;
  name: string;
  minClasses: number;
  icon: string;
  color: string;
  rewardOnUnlock?: Record<string, unknown> | null;
};

export const LOYALTY_LEVELS_SEED: LoyaltyLevelSeed[] = [
  {
    sortOrder: 0,
    name: "Bronce",
    minClasses: 0,
    icon: "🥉",
    color: "#CD7F32",
    rewardOnUnlock: null,
  },
  {
    sortOrder: 1,
    name: "Plata",
    minClasses: 10,
    icon: "🥈",
    color: "#C0C0C0",
    rewardOnUnlock: { type: "discount", amount: 10 },
  },
  {
    sortOrder: 2,
    name: "Oro",
    minClasses: 25,
    icon: "🥇",
    color: "#FFD700",
    rewardOnUnlock: { type: "free_class", count: 1 },
  },
  {
    sortOrder: 3,
    name: "Platino",
    minClasses: 50,
    icon: "💠",
    color: "#E5E4E2",
    rewardOnUnlock: { type: "free_class", count: 2 },
  },
  {
    sortOrder: 4,
    name: "Elite",
    minClasses: 100,
    icon: "👑",
    color: "#6366F1",
    rewardOnUnlock: { type: "free_class", count: 3 },
  },
];

function reward(
  type: "discount" | "free_class",
  amountOrCount: number,
): { rewardType: AchievementRewardType; rewardValue: Record<string, unknown> } {
  if (type === "discount") {
    return {
      rewardType: "DISCOUNT_PERCENT",
      rewardValue: { type: "percent", amount: amountOrCount },
    };
  }
  return {
    rewardType: "FREE_CLASS",
    rewardValue: { type: "free_classes", count: amountOrCount },
  };
}

const none = { rewardType: "NONE" as const, rewardValue: null };

export const SYSTEM_ACHIEVEMENTS_SEED: SystemAchievementSeed[] = [
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
    ...reward("discount", 10),
  },
  {
    key: "classes_10",
    name: "10 clases",
    description: "Llevas 10 clases completadas",
    icon: "🔥",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 10,
    ...reward("discount", 15),
  },
  {
    key: "classes_25",
    name: "25 clases",
    description: "Llevas 25 clases completadas",
    icon: "💪",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 25,
    ...reward("free_class", 1),
  },
  {
    key: "classes_50",
    name: "50 clases",
    description: "Llevas 50 clases completadas",
    icon: "🏆",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 50,
    ...reward("free_class", 2),
  },
  {
    key: "classes_100",
    name: "100 clases",
    description: "Llevas 100 clases completadas",
    icon: "👑",
    category: "MILESTONE",
    triggerType: "CLASS_COUNT",
    triggerValue: 100,
    ...reward("free_class", 3),
  },
  {
    key: "streak_3",
    name: "En racha",
    description: "3 días seguidos con clase",
    icon: "⚡",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 3,
    ...none,
  },
  {
    key: "streak_7",
    name: "Semana perfecta",
    description: "7 días seguidos con clase",
    icon: "🌟",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 7,
    ...reward("discount", 10),
  },
  {
    key: "streak_14",
    name: "Dos semanas seguidas",
    description: "14 días seguidos con clase",
    icon: "🚀",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 14,
    ...reward("discount", 15),
  },
  {
    key: "streak_30",
    name: "Mes imparable",
    description: "30 días seguidos con clase",
    icon: "💎",
    category: "STREAK",
    triggerType: "STREAK_DAYS",
    triggerValue: 30,
    ...reward("free_class", 1),
  },
  {
    key: "birthday",
    name: "Feliz cumpleaños",
    description: "¡Celebramos contigo en tu día!",
    icon: "🎂",
    category: "BIRTHDAY",
    triggerType: "BIRTHDAY",
    triggerValue: null,
    ...reward("free_class", 1),
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
  {
    key: "week_warrior",
    name: "Guerrero semanal",
    description: "5 clases en una sola semana",
    icon: "⚔️",
    category: "MILESTONE",
    triggerType: "FIVE_CLASSES_ONE_WEEK",
    triggerValue: 5,
    ...reward("discount", 10),
  },
  {
    key: "first_referral",
    name: "Embajador",
    description: "Tu primer referido se unió al estudio",
    icon: "🤝",
    category: "SOCIAL",
    triggerType: "REFERRAL",
    triggerValue: 1,
    ...reward("free_class", 1),
  },
  // Disciplinas (compat con el producto actual)
  {
    key: "first_class_type_reformer",
    name: "Reformer desbloqueado",
    description: "Tu primera clase de Reformer Pilates",
    icon: "🏋️",
    category: "MILESTONE",
    triggerType: "FIRST_CLASS_OF_TYPE",
    triggerValue: null,
    triggerConfig: { classTypeName: "Reformer Pilates" },
    ...none,
  },
  {
    key: "first_class_type_mat",
    name: "Mat Flow desbloqueado",
    description: "Tu primera clase de Mat Flow",
    icon: "🧘",
    category: "MILESTONE",
    triggerType: "FIRST_CLASS_OF_TYPE",
    triggerValue: null,
    triggerConfig: { classTypeName: "Mat Flow" },
    ...none,
  },
  {
    key: "first_class_type_barre",
    name: "Barre desbloqueado",
    description: "Tu primera clase de Barre Fusion",
    icon: "🩰",
    category: "MILESTONE",
    triggerType: "FIRST_CLASS_OF_TYPE",
    triggerValue: null,
    triggerConfig: { classTypeName: "Barre Fusion" },
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
  STREAK_30: "streak_30",
  EARLY_BIRD: "early_bird",
  NIGHT_OWL: "night_owl",
  WEEK_WARRIOR: "week_warrior",
  FIRST_CLASS_TYPE_REFORMER: "first_class_type_reformer",
  FIRST_CLASS_TYPE_MAT: "first_class_type_mat",
  FIRST_CLASS_TYPE_BARRE: "first_class_type_barre",
};

/** Clave de catálogo → tipo en payload del feed (compat con AchievementBadge / eventos viejos) */
export const KEY_TO_FEED_ACHIEVEMENT_TYPE: Record<string, string> = {
  first_class: "FIRST_CLASS",
  classes_5: "MILESTONE_5",
  classes_10: "MILESTONE_10",
  classes_25: "MILESTONE_25",
  classes_50: "MILESTONE_50",
  classes_100: "MILESTONE_100",
  streak_3: "STREAK_3",
  streak_7: "STREAK_7",
  streak_14: "STREAK_14",
  streak_30: "STREAK_30",
  birthday: "BIRTHDAY",
  early_bird: "EARLY_BIRD",
  night_owl: "NIGHT_OWL",
  week_warrior: "WEEK_WARRIOR",
  first_referral: "FIRST_REFERRAL",
  first_class_type_reformer: "FIRST_CLASS_TYPE_REFORMER",
  first_class_type_mat: "FIRST_CLASS_TYPE_MAT",
  first_class_type_barre: "FIRST_CLASS_TYPE_BARRE",
};

export function feedAchievementTypeFromKey(key: string): string {
  return KEY_TO_FEED_ACHIEVEMENT_TYPE[key] ?? key.toUpperCase();
}
