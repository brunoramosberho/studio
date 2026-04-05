import { prisma } from "@/lib/db";
import { ACHIEVEMENT_DEFS } from "./achievement-defs";
import { feedAchievementTypeFromKey } from "./gamification/catalog";
import { maxClassesInSingleWeek, syncMemberProgressFromBookings } from "./gamification/progress";
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
 * Crea eventos de feed agrupados por tipo de logro (misma UX que antes).
 */
export async function createGroupedAchievementEvents(
  grants: GrantedAchievement[],
  tenantId: string,
) {
  const byKey = new Map<string, string[]>();
  for (const g of grants) {
    const list = byKey.get(g.achievementKey) ?? [];
    list.push(g.userId);
    byKey.set(g.achievementKey, list);
  }

  for (const [achievementKey, userIds] of byKey) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true },
    });

    const achievement = await getAchievementByKey(achievementKey);
    const label =
      achievement?.name ??
      ACHIEVEMENT_DEFS[feedAchievementTypeFromKey(achievementKey)]?.label ??
      achievementKey;
    const description =
      achievement?.description ??
      ACHIEVEMENT_DEFS[feedAchievementTypeFromKey(achievementKey)]?.description ??
      "";
    const icon =
      achievement?.icon ??
      ACHIEVEMENT_DEFS[feedAchievementTypeFromKey(achievementKey)]?.icon ??
      "🏆";

    const achievementType = feedAchievementTypeFromKey(achievementKey);

    const feedEvent = await prisma.feedEvent.create({
      data: {
        userId: users[0].id,
        tenantId,
        eventType: "ACHIEVEMENT_UNLOCKED",
        visibility: "STUDIO_WIDE",
        payload: {
          achievementKey,
          achievementType,
          label,
          description,
          icon,
          users: users.map((u) => ({
            id: u.id,
            name: u.name ?? "Miembro",
            image: u.image,
          })),
        },
      },
    });

    const achRow = await getAchievementByKey(achievementKey);
    if (achRow) {
      await prisma.memberAchievement.updateMany({
        where: {
          tenantId,
          achievementId: achRow.id,
          userId: { in: userIds },
          feedEventId: null,
        },
        data: { feedEventId: feedEvent.id },
      });
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
  const longestStreak = progress?.longestStreak ?? 0;
  const maxWeek = maxClassesInSingleWeek(attendedBookings);

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

  for (const m of [5, 10, 25, 50, 100] as const) {
    if (totalAttended >= m) {
      await tryGrant(`classes_${m}`, { count: m });
    }
  }

  for (const b of attendedBookings) {
    const hour = new Date(b.class.startsAt).getHours();
    if (hour < 7) await tryGrant("early_bird");
    if (hour >= 21) await tryGrant("night_owl");
  }

  if (maxWeek >= 5) await tryGrant("week_warrior");

  if (longestStreak >= 3) await tryGrant("streak_3");
  if (longestStreak >= 7) await tryGrant("streak_7");
  if (longestStreak >= 14) await tryGrant("streak_14");
  if (longestStreak >= 30) await tryGrant("streak_30");

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
