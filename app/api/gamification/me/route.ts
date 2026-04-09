import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { feedAchievementTypeFromKey } from "@/lib/gamification/catalog";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const tenantId = tenant.id;

    const [progress, levels, achievements, rewards, activeSub, gamConfig] = await Promise.all([
      prisma.memberProgress.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        include: { currentLevel: true },
      }),
      prisma.loyaltyLevel.findMany({ orderBy: { minClasses: "asc" } }),
      prisma.memberAchievement.findMany({
        where: { userId, tenantId },
        include: { achievement: true },
        orderBy: { earnedAt: "desc" },
      }),
      prisma.memberReward.findMany({
        where: { userId, tenantId, consumedAt: null },
        orderBy: { appliedAt: "desc" },
      }),
      prisma.userPackage.findFirst({
        where: {
          userId,
          tenantId,
          expiresAt: { gt: new Date() },
          package: { type: "SUBSCRIPTION" },
        },
        select: { id: true },
      }),
      prisma.tenantGamificationConfig.findUnique({
        where: { tenantId },
      }),
    ]);

    const achOverrides = (gamConfig?.achievementOverrides ?? {}) as Record<string, { enabled?: boolean; name?: string; icon?: string }>;
    const levelOverrides = (gamConfig?.levelOverrides ?? {}) as Record<string, { name?: string; minClasses?: number }>;
    const levelsEnabled = gamConfig?.levelsEnabled ?? true;
    const achievementsEnabled = gamConfig?.achievementsEnabled ?? true;

    const allAchievements = await prisma.achievement.findMany({
      where: {
        active: true,
        OR: [{ tenantId: null }, { tenantId }],
      },
      orderBy: { createdAt: "asc" },
    });

    const filteredAchievements = achievementsEnabled
      ? allAchievements.filter((a) => achOverrides[a.key]?.enabled !== false)
      : [];

    const earnedIds = new Set(achievements.map((a) => a.achievementId));

    const currentLevel = progress?.currentLevel ?? levels[0] ?? null;
    const nextLevel = currentLevel
      ? levels.find((l) => l.minClasses > currentLevel.minClasses) ?? null
      : levels[1] ?? null;

    const totalClasses = progress?.totalClassesAttended ?? 0;
    const classesToNext = nextLevel ? Math.max(0, nextLevel.minClasses - totalClasses) : 0;
    const progressPercent =
      currentLevel && nextLevel && nextLevel.minClasses > currentLevel.minClasses
        ? Math.min(
            100,
            Math.round(
              ((totalClasses - currentLevel.minClasses) /
                (nextLevel.minClasses - currentLevel.minClasses)) *
                100,
            ),
          )
        : currentLevel && !nextLevel
          ? 100
          : 0;

    const applyLevelOverride = (l: typeof levels[number]) => {
      const ovr = levelOverrides[String(l.sortOrder)];
      return {
        id: l.id,
        name: ovr?.name ?? l.name,
        icon: l.icon,
        color: l.color,
        minClasses: ovr?.minClasses ?? l.minClasses,
        sortOrder: l.sortOrder,
      };
    };

    return NextResponse.json({
      hasActiveMembership: !!activeSub,
      levelsEnabled,
      achievementsEnabled,
      level: currentLevel && levelsEnabled
        ? { ...applyLevelOverride(currentLevel) }
        : null,
      nextLevel: nextLevel && levelsEnabled
        ? { ...applyLevelOverride(nextLevel) }
        : null,
      totalClasses,
      classesToNext,
      progressPercent,
      currentStreak: progress?.currentStreak ?? 0,
      longestStreak: progress?.longestStreak ?? 0,
      freeClassCredits: progress?.freeClassCredits ?? 0,
      levels: levelsEnabled
        ? levels.map((l) => ({
            ...applyLevelOverride(l),
            rewardOnUnlock: l.rewardOnUnlock,
            reached: totalClasses >= (levelOverrides[String(l.sortOrder)]?.minClasses ?? l.minClasses),
            isCurrent: l.id === currentLevel?.id,
          }))
        : [],
      achievements: filteredAchievements.map((a) => {
        const earned = achievements.find((e) => e.achievementId === a.id);
        const ovr = achOverrides[a.key];
        return {
          id: a.id,
          key: a.key,
          name: ovr?.name ?? a.name,
          description: a.description,
          icon: ovr?.icon ?? a.icon,
          category: a.category,
          achievementType: feedAchievementTypeFromKey(a.key),
          rewardType: a.rewardType,
          rewardValue: a.rewardValue,
          earned: earnedIds.has(a.id),
          earnedAt: earned?.earnedAt ?? null,
          rewardApplied: earned?.rewardApplied ?? false,
        };
      }),
      rewards: rewards.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        rewardKind: r.rewardKind,
        rewardData: r.rewardData,
        appliedAt: r.appliedAt,
        expiresAt: r.expiresAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/gamification/me error:", error);
    return NextResponse.json(
      { error: "Failed to fetch gamification data" },
      { status: 500 },
    );
  }
}
