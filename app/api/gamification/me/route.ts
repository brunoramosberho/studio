import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { feedAchievementTypeFromKey } from "@/lib/gamification/catalog";
import { isApplePassConfigured } from "@/lib/wallet/config";

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

    const totalClasses = progress?.totalClassesAttended ?? 0;

    // Apply the tenant's overrides (name + threshold) up front, then derive the
    // whole ladder from the EFFECTIVE thresholds. The level cards already use
    // the overridden thresholds for `reached`; deriving current/next/progress
    // the same way keeps them in sync. (Previously current/next/classesToNext
    // used the default minClasses, so an edited threshold — e.g. Favorite
    // 10 → 20 — made the badge say "6 to Favorite" while the card said 20.)
    const effectiveLevels = levels
      .map((l) => {
        const ovr = levelOverrides[String(l.sortOrder)];
        return {
          id: l.id,
          name: ovr?.name ?? l.name,
          icon: l.icon,
          color: l.color,
          minClasses: ovr?.minClasses ?? l.minClasses,
          sortOrder: l.sortOrder,
        };
      })
      .sort((a, b) => a.minClasses - b.minClasses);

    // Current = highest level whose (effective) threshold is met; next = the one
    // after it in the ladder.
    let currentIdx = 0;
    for (let i = 0; i < effectiveLevels.length; i++) {
      if (totalClasses >= effectiveLevels[i].minClasses) currentIdx = i;
    }
    const currentLevel = effectiveLevels[currentIdx] ?? null;
    const nextLevel = effectiveLevels[currentIdx + 1] ?? null;

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
      hasActiveMembership: !!activeSub,
      walletPassAvailable: isApplePassConfigured(),
      levelsEnabled,
      achievementsEnabled,
      level: currentLevel && levelsEnabled ? { ...currentLevel } : null,
      nextLevel: nextLevel && levelsEnabled ? { ...nextLevel } : null,
      totalClasses,
      classesToNext,
      progressPercent,
      currentStreak: progress?.currentStreak ?? 0,
      longestStreak: progress?.longestStreak ?? 0,
      levels: levelsEnabled
        ? effectiveLevels.map((l) => ({
            ...l,
            reached: totalClasses >= l.minClasses,
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
