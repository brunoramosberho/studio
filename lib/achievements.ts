import { prisma } from "./db";
import { startOfWeek, endOfWeek, subDays, isBefore } from "date-fns";

export const ACHIEVEMENT_DEFS: Record<
  string,
  { label: string; description: string; icon: string }
> = {
  FIRST_CLASS: {
    label: "Primera Clase",
    description: "Completaste tu primera clase en Flō",
    icon: "🎉",
  },
  FIRST_CLASS_TYPE_REFORMER: {
    label: "Reformer Desbloqueado",
    description: "Tu primera clase de Reformer Pilates",
    icon: "🏋️",
  },
  FIRST_CLASS_TYPE_MAT: {
    label: "Mat Flow Desbloqueado",
    description: "Tu primera clase de Mat Flow",
    icon: "🧘",
  },
  FIRST_CLASS_TYPE_BARRE: {
    label: "Barre Desbloqueado",
    description: "Tu primera clase de Barre Fusion",
    icon: "🩰",
  },
  MILESTONE_5: {
    label: "5 Clases",
    description: "Llevas 5 clases completadas",
    icon: "⭐",
  },
  MILESTONE_10: {
    label: "10 Clases",
    description: "Llevas 10 clases completadas",
    icon: "🌟",
  },
  MILESTONE_25: {
    label: "25 Clases",
    description: "Llevas 25 clases completadas",
    icon: "💫",
  },
  MILESTONE_50: {
    label: "50 Clases",
    description: "Llevas 50 clases completadas",
    icon: "🔥",
  },
  MILESTONE_100: {
    label: "100 Clases",
    description: "Llevas 100 clases completadas — ¡Leyenda!",
    icon: "👑",
  },
  STREAK_7: {
    label: "Racha de 7 días",
    description: "Asististe 7 días seguidos",
    icon: "🔥",
  },
  STREAK_30: {
    label: "Racha de 30 días",
    description: "Asististe 30 días seguidos",
    icon: "💎",
  },
  EARLY_BIRD: {
    label: "Early Bird",
    description: "Tomaste una clase antes de las 7am",
    icon: "🌅",
  },
  NIGHT_OWL: {
    label: "Night Owl",
    description: "Tomaste una clase después de las 8pm",
    icon: "🌙",
  },
  WEEK_WARRIOR: {
    label: "Week Warrior",
    description: "5 clases en una sola semana",
    icon: "⚔️",
  },
};

async function grantAchievement(
  userId: string,
  achievementType: string,
  metadata?: Record<string, string | number>,
) {
  const existing = await prisma.userAchievement.findUnique({
    where: { userId_achievementType: { userId, achievementType } },
  });
  if (existing) return null;

  await prisma.userAchievement.create({
    data: {
      userId,
      achievementType,
      metadata: (metadata ?? {}) as unknown as import("@prisma/client/runtime/library").JsonObject,
    },
  });

  return achievementType;
}

export interface GrantedAchievement {
  userId: string;
  achievementType: string;
}

/**
 * Creates grouped feed events: one per achievement type, listing all users
 * who earned that achievement in this batch.
 */
export async function createGroupedAchievementEvents(
  grants: GrantedAchievement[],
) {
  const byType = new Map<string, string[]>();
  for (const g of grants) {
    const list = byType.get(g.achievementType) ?? [];
    list.push(g.userId);
    byType.set(g.achievementType, list);
  }

  for (const [achievementType, userIds] of byType) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true },
    });

    const def = ACHIEVEMENT_DEFS[achievementType];
    await prisma.feedEvent.create({
      data: {
        userId: users[0].id,
        eventType: "ACHIEVEMENT_UNLOCKED",
        visibility: "STUDIO_WIDE",
        payload: {
          achievementType,
          label: def?.label ?? achievementType,
          description: def?.description ?? "",
          icon: def?.icon ?? "🏆",
          users: users.map((u) => ({
            id: u.id,
            name: u.name ?? "Miembro",
            image: u.image,
          })),
        },
      },
    });
  }
}

export async function checkAchievements(userId: string) {
  const attendedBookings = await prisma.booking.findMany({
    where: { userId, status: "ATTENDED" },
    include: { class: { include: { classType: true } } },
    orderBy: { class: { startsAt: "asc" } },
  });

  const totalAttended = attendedBookings.length;
  const granted: GrantedAchievement[] = [];

  // FIRST_CLASS
  if (totalAttended >= 1) {
    const r = await grantAchievement(userId, "FIRST_CLASS");
    if (r) granted.push({ userId, achievementType: r });
  }

  // FIRST_CLASS_TYPE per discipline
  const classTypeNames = new Set(
    attendedBookings.map((b) => b.class.classType.name),
  );
  const typeMap: Record<string, string> = {
    "Reformer Pilates": "FIRST_CLASS_TYPE_REFORMER",
    "Mat Flow": "FIRST_CLASS_TYPE_MAT",
    "Barre Fusion": "FIRST_CLASS_TYPE_BARRE",
  };
  for (const [name, achievement] of Object.entries(typeMap)) {
    if (classTypeNames.has(name)) {
      const r = await grantAchievement(userId, achievement, { classType: name });
      if (r) granted.push({ userId, achievementType: r });
    }
  }

  // MILESTONES
  const milestones = [5, 10, 25, 50, 100] as const;
  for (const m of milestones) {
    if (totalAttended >= m) {
      const r = await grantAchievement(userId, `MILESTONE_${m}`, { count: m });
      if (r) granted.push({ userId, achievementType: r });
    }
  }

  // EARLY_BIRD / NIGHT_OWL
  for (const b of attendedBookings) {
    const hour = new Date(b.class.startsAt).getHours();
    if (hour < 7) {
      const r = await grantAchievement(userId, "EARLY_BIRD");
      if (r) granted.push({ userId, achievementType: r });
    }
    if (hour >= 20) {
      const r = await grantAchievement(userId, "NIGHT_OWL");
      if (r) granted.push({ userId, achievementType: r });
    }
  }

  // WEEK_WARRIOR — 5 classes in one calendar week
  const weekCounts = new Map<string, number>();
  for (const b of attendedBookings) {
    const ws = startOfWeek(new Date(b.class.startsAt), { weekStartsOn: 1 });
    const key = ws.toISOString();
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }
  for (const count of weekCounts.values()) {
    if (count >= 5) {
      const r = await grantAchievement(userId, "WEEK_WARRIOR");
      if (r) granted.push({ userId, achievementType: r });
      break;
    }
  }

  // STREAKS — consecutive days with at least one class
  const attendedDays = [
    ...new Set(
      attendedBookings.map((b) =>
        new Date(b.class.startsAt).toISOString().slice(0, 10),
      ),
    ),
  ].sort();

  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < attendedDays.length; i++) {
    const prev = new Date(attendedDays[i - 1]);
    const curr = new Date(attendedDays[i]);
    const diffDays =
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  if (maxStreak >= 7) {
    const r = await grantAchievement(userId, "STREAK_7");
    if (r) granted.push({ userId, achievementType: r });
  }
  if (maxStreak >= 30) {
    const r = await grantAchievement(userId, "STREAK_30");
    if (r) granted.push({ userId, achievementType: r });
  }

  return granted;
}
