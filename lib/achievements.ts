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
import {
  applyAchievementCatalogReward,
  applyGamificationReward,
} from "./gamification/rewards";
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

  const row = await prisma.memberAchievement.create({
    data: {
      userId,
      tenantId,
      achievementId: achievement.id,
      metadata: (metadata ?? {}) as import("@prisma/client/runtime/library").JsonObject,
    },
  });

  if (achievement.rewardType !== "NONE") {
    await applyAchievementCatalogReward({
      userId,
      tenantId,
      achievementId: achievement.id,
      rewardType: achievement.rewardType,
      rewardValue: achievement.rewardValue,
    });
    await prisma.memberAchievement.update({
      where: { id: row.id },
      data: { rewardApplied: true, rewardAppliedAt: new Date() },
    });
  }

  notifyAchievement(userId, tenantId, achievement).catch(() => {});

  return achievementKey;
}

function rewardText(rewardType: string, rewardValue: unknown): string | null {
  if (rewardType === "NONE" || !rewardValue) return null;
  const rv = rewardValue as Record<string, unknown>;
  if (rv.type === "percent" || rv.type === "discount")
    return `${rv.amount ?? 10}% de descuento en tu próximo paquete`;
  if (rv.type === "free_classes" || rv.type === "free_class")
    return `${rv.count ?? 1} clase${(rv.count as number) > 1 ? "s" : ""} gratis`;
  return null;
}

async function notifyAchievement(
  userId: string,
  tenantId: string,
  achievement: { name: string; icon: string; description: string | null; rewardType: string; rewardValue: unknown },
) {
  const rText = rewardText(achievement.rewardType, achievement.rewardValue);

  sendPushToUser(userId, {
    title: `${achievement.icon} ¡Logro desbloqueado!`,
    body: `Conseguiste "${achievement.name}"${rText ? ` — ${rText}` : ""}`,
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
      rewardText: rText,
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
    const r = await grantAchievement(userId, tenantId, key, meta);
    if (r) granted.push({ userId, achievementKey: r });
  };

  if (totalAttended >= 1) await tryGrant("first_class");

  const classTypeNames = new Set(
    attendedBookings.map((b) => b.class.classType.name),
  );
  const typeMap: Record<string, string> = {
    "Reformer Pilates": "first_class_type_reformer",
    "Mat Flow": "first_class_type_mat",
    "Barre Fusion": "first_class_type_barre",
  };
  for (const [name, key] of Object.entries(typeMap)) {
    if (classTypeNames.has(name)) {
      await tryGrant(key, { classType: name });
    }
  }

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
  if (longestStrk >= 3) await tryGrant("streak_3");
  if (longestStrk >= 7) await tryGrant("streak_7");
  if (longestStrk >= 14) await tryGrant("streak_14");
  if (longestStrk >= 30) await tryGrant("streak_30");
  if (longestStrk >= 60) await tryGrant("streak_60");
  if (longestStrk >= 90) await tryGrant("streak_90");

  // Weekly streaks (consecutive weeks with at least 1 class)
  if (weeklyStrk >= 4) await tryGrant("weekly_streak_4");
  if (weeklyStrk >= 8) await tryGrant("weekly_streak_8");
  if (weeklyStrk >= 12) await tryGrant("weekly_streak_12");
  if (weeklyStrk >= 26) await tryGrant("weekly_streak_26");
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

  const raw = target.rewardOnUnlock;
  if (raw && typeof raw === "object" && raw !== null && "type" in raw) {
    const r = raw as { type: string; amount?: number; count?: number };
    if (r.type === "discount" && r.amount != null) {
      await applyGamificationReward({
        userId,
        tenantId,
        sourceType: "LEVEL_UP",
        sourceId: target.id,
        rewardKind: "DISCOUNT_CODE",
        rewardData: {
          discountPercent: r.amount,
          code: `LEVEL-${target.sortOrder}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          singleUse: true,
        },
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
    } else if (r.type === "free_class" && r.count != null) {
      await applyGamificationReward({
        userId,
        tenantId,
        sourceType: "LEVEL_UP",
        sourceId: target.id,
        rewardKind: "FREE_CLASS",
        rewardData: { count: r.count, source: "level_up" },
      });
    }
  }

  notifyLevelUp(userId, tenantId, target, raw).catch(() => {});
}

async function notifyLevelUp(
  userId: string,
  tenantId: string,
  level: { name: string; icon: string; sortOrder: number },
  rawReward: unknown,
) {
  let rText: string | null = null;
  if (rawReward && typeof rawReward === "object" && rawReward !== null && "type" in rawReward) {
    const r = rawReward as { type: string; amount?: number; count?: number };
    if (r.type === "discount") rText = `${r.amount}% de descuento`;
    else if (r.type === "free_class") rText = `${r.count} clase${(r.count ?? 1) > 1 ? "s" : ""} gratis`;
  }

  sendPushToUser(userId, {
    title: `${level.icon} ¡Subiste a ${level.name}!`,
    body: rText ? `Nuevo nivel desbloqueado — ${rText}` : "Nuevo nivel desbloqueado",
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
      rewardText: rText,
    }).catch(() => {});
  }
}
