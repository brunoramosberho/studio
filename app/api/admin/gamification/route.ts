import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");

    const [
      loyaltyLevels,
      systemAchievements,
      clientsWithProgress,
      maCount,
      config,
      recentAchievements,
    ] = await Promise.all([
      prisma.loyaltyLevel.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.achievement.findMany({
        where: { tenantId: null, isSystem: true },
        orderBy: [{ category: "asc" }, { key: "asc" }],
      }),
      prisma.memberProgress.count({ where: { tenantId: tenant.id } }),
      prisma.memberAchievement.count({ where: { tenantId: tenant.id } }),
      prisma.tenantGamificationConfig.findUnique({
        where: { tenantId: tenant.id },
      }),
      prisma.memberAchievement.findMany({
        where: {
          tenantId: tenant.id,
          earnedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
          achievement: { select: { key: true, name: true, icon: true, description: true } },
        },
        orderBy: { earnedAt: "desc" },
        take: 100,
      }),
    ]);

    const recentRewards = await prisma.memberReward.findMany({
      where: {
        tenantId: tenant.id,
        appliedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { userId: true, sourceType: true, sourceId: true, rewardKind: true, rewardData: true },
    });
    const rewardsByUser = new Map<string, typeof recentRewards>();
    for (const r of recentRewards) {
      const list = rewardsByUser.get(r.userId) ?? [];
      list.push(r);
      rewardsByUser.set(r.userId, list);
    }

    return NextResponse.json({
      loyaltyLevels: loyaltyLevels.map((l) => ({
        id: l.id,
        sortOrder: l.sortOrder,
        name: l.name,
        minClasses: l.minClasses,
        icon: l.icon,
        color: l.color,
      })),
      systemAchievements: systemAchievements.map((a) => ({
        id: a.id,
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        triggerType: a.triggerType,
        triggerValue: a.triggerValue,
        active: a.active,
      })),
      config: config
        ? {
            levelsEnabled: config.levelsEnabled,
            achievementsEnabled: config.achievementsEnabled,
            autoRewardsEnabled: config.autoRewardsEnabled,
            levelOverrides: config.levelOverrides ?? {},
            achievementOverrides: config.achievementOverrides ?? {},
            autoRewards: config.autoRewards ?? [],
          }
        : {
            levelsEnabled: true,
            achievementsEnabled: true,
            autoRewardsEnabled: false,
            levelOverrides: {},
            achievementOverrides: {},
            autoRewards: [],
          },
      recentAchievements: recentAchievements.map((ma) => ({
        id: ma.id,
        earnedAt: ma.earnedAt.toISOString(),
        rewardApplied: ma.rewardApplied,
        user: {
          id: ma.user.id,
          name: ma.user.name,
          email: ma.user.email,
          image: ma.user.image,
        },
        achievement: {
          key: ma.achievement.key,
          name: ma.achievement.name,
          icon: ma.achievement.icon,
          description: ma.achievement.description,
        },
        rewards: (rewardsByUser.get(ma.userId) ?? [])
          .filter((r) => r.sourceId === ma.achievementId)
          .map((r) => ({
            kind: r.rewardKind,
            data: r.rewardData,
          })),
      })),
      stats: {
        clientsWithProgress,
        totalMemberAchievements: maCount,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "Unauthorized" || msg === "Tenant not found") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("GET /api/admin/gamification", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const body = await request.json();

    const {
      levelsEnabled,
      achievementsEnabled,
      autoRewardsEnabled,
      levelOverrides,
      achievementOverrides,
      autoRewards,
    } = body as {
      levelsEnabled?: boolean;
      achievementsEnabled?: boolean;
      autoRewardsEnabled?: boolean;
      levelOverrides?: Record<string, unknown>;
      achievementOverrides?: Record<string, unknown>;
      autoRewards?: unknown[];
    };

    const config = await prisma.tenantGamificationConfig.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        levelsEnabled: levelsEnabled ?? true,
        achievementsEnabled: achievementsEnabled ?? true,
        autoRewardsEnabled: autoRewardsEnabled ?? false,
        levelOverrides: (levelOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
        achievementOverrides: (achievementOverrides ?? undefined) as Prisma.InputJsonValue | undefined,
        autoRewards: (autoRewards ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      update: {
        ...(levelsEnabled !== undefined && { levelsEnabled }),
        ...(achievementsEnabled !== undefined && { achievementsEnabled }),
        ...(autoRewardsEnabled !== undefined && { autoRewardsEnabled }),
        ...(levelOverrides !== undefined && { levelOverrides: levelOverrides as Prisma.InputJsonValue }),
        ...(achievementOverrides !== undefined && { achievementOverrides: achievementOverrides as Prisma.InputJsonValue }),
        ...(autoRewards !== undefined && { autoRewards: autoRewards as Prisma.InputJsonValue }),
      },
    });

    return NextResponse.json({ ok: true, config });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "Unauthorized" || msg === "Tenant not found") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("PUT /api/admin/gamification", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
