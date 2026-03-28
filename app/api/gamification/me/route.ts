import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { feedAchievementTypeFromKey } from "@/lib/gamification/catalog";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const tenantId = tenant.id;

    const [progress, levels, achievements, rewards] = await Promise.all([
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
    ]);

    const allAchievements = await prisma.achievement.findMany({
      where: {
        active: true,
        OR: [{ tenantId: null }, { tenantId }],
      },
      orderBy: { createdAt: "asc" },
    });

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

    return NextResponse.json({
      level: currentLevel
        ? {
            id: currentLevel.id,
            name: currentLevel.name,
            icon: currentLevel.icon,
            color: currentLevel.color,
            minClasses: currentLevel.minClasses,
          }
        : null,
      nextLevel: nextLevel
        ? {
            id: nextLevel.id,
            name: nextLevel.name,
            icon: nextLevel.icon,
            color: nextLevel.color,
            minClasses: nextLevel.minClasses,
          }
        : null,
      totalClasses,
      classesToNext,
      progressPercent,
      currentStreak: progress?.currentStreak ?? 0,
      longestStreak: progress?.longestStreak ?? 0,
      freeClassCredits: progress?.freeClassCredits ?? 0,
      levels: levels.map((l) => ({
        id: l.id,
        name: l.name,
        icon: l.icon,
        color: l.color,
        minClasses: l.minClasses,
        rewardOnUnlock: l.rewardOnUnlock,
        reached: totalClasses >= l.minClasses,
        isCurrent: l.id === currentLevel?.id,
      })),
      achievements: allAchievements.map((a) => {
        const earned = achievements.find((e) => e.achievementId === a.id);
        return {
          id: a.id,
          key: a.key,
          name: a.name,
          description: a.description,
          icon: a.icon,
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
