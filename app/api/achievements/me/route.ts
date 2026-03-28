import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { ACHIEVEMENT_DEFS } from "@/lib/achievements";
import { feedAchievementTypeFromKey } from "@/lib/gamification/catalog";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const rows = await prisma.memberAchievement.findMany({
      where: { userId: session.user.id, tenantId: tenant.id },
      include: { achievement: true },
      orderBy: { earnedAt: "desc" },
    });

    const enriched = rows.map((a) => {
      const achievementType = feedAchievementTypeFromKey(a.achievement.key);
      return {
        id: a.id,
        achievementKey: a.achievement.key,
        achievementType,
        earnedAt: a.earnedAt,
        rewardApplied: a.rewardApplied,
        ...(ACHIEVEMENT_DEFS[achievementType] ?? {
          label: a.achievement.name,
          description: a.achievement.description ?? "",
          icon: a.achievement.icon,
        }),
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/achievements/me error:", error);
    return NextResponse.json(
      { error: "Failed to fetch achievements" },
      { status: 500 },
    );
  }
}
