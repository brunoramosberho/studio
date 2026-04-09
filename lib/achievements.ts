import { prisma } from "@/lib/db";
import { ACHIEVEMENT_DEFS } from "./achievement-defs";
import { feedAchievementTypeFromKey } from "./gamification/catalog";
import {
  maxClassesInSingleWeek,
  syncMemberProgressFromBookings,
  longestWeeklyStreak,
  distinctClassTypes,
  detectComeback,
} from "./gamification/progress";
import { sendPushToUser } from "./push";
import { sendAchievementUnlocked, sendLevelUp } from "./email";

export { ACHIEVEMENT_DEFS };

export interface GrantedAchievement {
  userId: string;
  achievementKey: string;
}

async function getAchievementByKey(key: string) {
  return prisma.achievement.findUnique({ where: { key } });
}

/** Otorga un logro por clave (p. ej. desde admin). Devuelve la clave si se creó, null si ya existía o no aplica. */
export async function grantAchievementManually(
  userId: string,
  tenantId: string,
  achievementKey: string,
  metadata?: Record<string, string | number>,
) {
  return grantAchievement(userId, tenantId, achievementKey, metadata);
}

async function grantAchievement(
  userId: string,
  tenantId: string,
  achievementKey: string,
  metadata?: Record<string, string | number>,
) {
  const achievement = await getAchievementByKey(achievementKey);
  if (!achievement || !achievement.active) return null;

  const existing = await prisma.memberAchievement.findUnique({
    where: {
      userId_tenantId_achievementId: {
        userId,
        tenantId,
        achievementId: achievement.id,
      },
    },
  });
  if (existing) return null;

  await prisma.memberAchievement.create({
    data: {
      userId,
      tenantId,
      achievementId: achievement.id,
      metadata: (metadata ?? {}) as import("@prisma/client/runtime/library").JsonObject,
    },
  });

  notifyAchievement(userId, tenantId, achievement).catch(() => {});

  return achievementKey;
}

async function notifyAchievement(
  userId: string,
  tenantId: string,
  achievement: { name: string; icon: string; description: string | null },
) {
  sendPushToUser(userId, {
    title: `${achievement.icon} ¡Logro desbloqueado!`,
    body: `Conseguiste "${achievement.name}"`,
    url: "/my/profile",
    tag: `achievement-${achievement.name}`,
  }, tenantId).catch(() => {});

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (user?.email) {
    sendAchievementUnlocked({
      to: user.email,
      name: user.name ?? "Miembro",
      achievementName: achievement.name,
      achievementIcon: achievement.icon,
      achievementDescription: achievement.description ?? "",
      rewardText: null,
    }).catch(() => {});
  }
}

/**
 * Creates feed events grouped by user so that a single person unlocking
 * multiple achievements only produces ONE feed post (instead of N).
 */
export async function createGroupedAchievementEvents(
  grants: GrantedAchievement[],
  tenantId: string,
) {
  const byUser = new Map<string, string[]>();
  for (const g of grants) {
    const list = byUser.get(g.userId) ?? [];
    list.push(g.achievementKey);
    byUser.set(g.userId, list);
  }

  for (const [userId, keys] of byUser) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, image: true },
    });
    if (!user) continue;

    const achievements: {
      achievementKey: string;
      achievementType: string;
      label: string;
      description: string;
      icon: string;
    }[] = [];

    for (const key of keys) {
      const row = await getAchievementByKey(key);
      const type = feedAchievementTypeFromKey(key);
      achievements.push({
        achievementKey: key,
        achievementType: type,
        label:
          row?.name ??
          ACHIEVEMENT_DEFS[type]?.label ??
          key,
        description:
          row?.description ??
          ACHIEVEMENT_DEFS[type]?.description ??
          "",
        icon:
          row?.icon ??
          ACHIEVEMENT_DEFS[type]?.icon ??
          "🏆",
      });
    }

    const first = achievements[0];

    const feedEvent = await prisma.feedEvent.create({
      data: {
        userId,
        tenantId,
        eventType: "ACHIEVEMENT_UNLOCKED",
        visibility: "STUDIO_WIDE",
        payload: {
          achievementKey: first.achievementKey,
          achievementType: first.achievementType,
          label: first.label,
          description: first.description,
          icon: first.icon,
          users: [{ id: user.id, name: user.name ?? "Miembro", image: user.image }],
          achievements,
        },
      },
    });

    for (const key of keys) {
      const achRow = await getAchievementByKey(key);
      if (achRow) {
        await prisma.memberAchievement.updateMany({
          where: {
            tenantId,
            achievementId: achRow.id,
            userId,
            feedEventId: null,
          },
          data: { feedEventId: feedEvent.id },
        });
      }
    }
  }
}

export async function checkAchievements(userId: string, tenantId: string) {
  await syncMemberProgressFromBookings(userId, tenantId);

  const config = await prisma.tenantGamificationConfig.findUnique({
    where: { tenantId },
  });

  if (config && !config.achievementsEnabled) {
    const count = await prisma.booking.count({
      where: { userId, tenantId, status: "ATTENDED" },
    });
    await checkLevelUp(userId, tenantId, count);
    return [];
  }

  const disabledKeys = new Set<string>();
  if (config?.achievementOverrides && typeof config.achievementOverrides === "object") {
    const overrides = config.achievementOverrides as Record<string, { enabled?: boolean }>;
    for (const [key, ovr] of Object.entries(overrides)) {
      if (ovr?.enabled === false) disabledKeys.add(key);
    }
  }

  const attendedBookings = await prisma.booking.findMany({
    where: { userId, tenantId, status: "ATTENDED" },
    include: { class: { include: { classType: true } } },
    orderBy: { class: { startsAt: "asc" } },
  });

  const progress = await prisma.memberProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });

  const totalAttended = attendedBookings.length;
  const longestStrk = progress?.longestStreak ?? 0;
  const maxWeek = maxClassesInSingleWeek(attendedBookings);
  const weeklyStrk = longestWeeklyStreak(attendedBookings);
  const classVariety = distinctClassTypes(attendedBookings);
  const isComeback = detectComeback(attendedBookings, 30);

  const granted: GrantedAchievement[] = [];

  const tryGrant = async (
    key: string,
    meta?: Record<string, string | number>,
  ) => {
    if (disabledKeys.has(key)) return;
    const r = await grantAchievement(userId, tenantId, key, meta);
    if (r) granted.push({ userId, achievementKey: r });
  };

  if (totalAttended >= 1) await tryGrant("first_class");

  for (const m of [5, 10, 25, 50, 100, 150, 200, 300, 500]) {
    if (totalAttended >= m) {
      await tryGrant(`classes_${m}`, { count: m });
    }
  }

  for (const b of attendedBookings) {
    const hour = new Date(b.class.startsAt).getHours();
    if (hour < 7) await tryGrant("early_bird");
    if (hour >= 21) await tryGrant("night_owl");
  }

  // Weekly intensity
  if (maxWeek >= 3) await tryGrant("classes_3_week");
  if (maxWeek >= 5) await tryGrant("week_warrior");
  if (maxWeek >= 7) await tryGrant("classes_7_week");

  // Day streaks
  if (longestStrk >= 2) await tryGrant("streak_2");
  if (longestStrk >= 3) await tryGrant("streak_3");
  if (longestStrk >= 5) await tryGrant("streak_5");
  if (longestStrk >= 7) await tryGrant("streak_7");

  // Weekly streaks (consecutive weeks with at least 1 class)
  if (weeklyStrk >= 2) await tryGrant("weekly_streak_2");
  if (weeklyStrk >= 4) await tryGrant("weekly_streak_4");
  if (weeklyStrk >= 6) await tryGrant("weekly_streak_6");
  if (weeklyStrk >= 8) await tryGrant("weekly_streak_8");
  if (weeklyStrk >= 12) await tryGrant("weekly_streak_12");
  if (weeklyStrk >= 16) await tryGrant("weekly_streak_16");
  if (weeklyStrk >= 20) await tryGrant("weekly_streak_20");
  if (weeklyStrk >= 26) await tryGrant("weekly_streak_26");
  if (weeklyStrk >= 36) await tryGrant("weekly_streak_36");
  if (weeklyStrk >= 52) await tryGrant("weekly_streak_52");

  // Class variety
  if (classVariety >= 3) await tryGrant("variety_3");
  if (classVariety >= 5) await tryGrant("variety_5");

  // Comeback
  if (isComeback) await tryGrant("comeback");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthday: true },
  });
  if (user?.birthday) {
    const now = new Date();
    if (
      user.birthday.getUTCMonth() === now.getUTCMonth() &&
      user.birthday.getUTCDate() === now.getUTCDate()
    ) {
      await tryGrant("birthday");
    }

    // Birthday class: attended a class on your birthday
    const bMonth = user.birthday.getUTCMonth();
    const bDay = user.birthday.getUTCDate();
    const attendedOnBirthday = attendedBookings.some((b) => {
      const d = new Date(b.class.startsAt);
      return d.getUTCMonth() === bMonth && d.getUTCDate() === bDay;
    });
    if (attendedOnBirthday) await tryGrant("birthday_class");
  }

  await checkLevelUp(userId, tenantId, totalAttended);

  return granted;
}

async function checkLevelUp(
  userId: string,
  tenantId: string,
  totalClassesAttended: number,
) {
  const cfg = await prisma.tenantGamificationConfig.findUnique({
    where: { tenantId },
  });
  if (cfg && !cfg.levelsEnabled) return;

  const levels = await prisma.loyaltyLevel.findMany({
    orderBy: { minClasses: "asc" },
  });
  if (levels.length === 0) return;

  let target = levels[0];
  for (const L of levels) {
    if (totalClassesAttended >= L.minClasses) target = L;
  }

  const progress = await prisma.memberProgress.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!progress) return;

  if (!progress.currentLevelId) {
    await prisma.memberProgress.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { currentLevelId: target.id },
    });
    return;
  }

  if (progress.currentLevelId === target.id) return;

  await prisma.memberProgress.update({
    where: { userId_tenantId: { userId, tenantId } },
    data: { currentLevelId: target.id },
  });

  await prisma.feedEvent.create({
    data: {
      userId,
      tenantId,
      eventType: "LEVEL_UP",
      visibility: "STUDIO_WIDE",
      payload: {
        levelId: target.id,
        levelName: target.name,
        icon: target.icon,
        color: target.color,
        minClasses: target.minClasses,
      },
    },
  });

  notifyLevelUp(userId, tenantId, target).catch(() => {});
}

async function notifyLevelUp(
  userId: string,
  tenantId: string,
  level: { name: string; icon: string; sortOrder: number },
) {
  sendPushToUser(userId, {
    title: `${level.icon} ¡Subiste a ${level.name}!`,
    body: "Nuevo nivel desbloqueado",
    url: "/my/profile",
    tag: `level-up-${level.sortOrder}`,
  }, tenantId).catch(() => {});

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (user?.email) {
    sendLevelUp({
      to: user.email,
      name: user.name ?? "Miembro",
      levelName: level.name,
      levelIcon: level.icon,
      rewardText: null,
    }).catch(() => {});
  }
}
