import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { ACHIEVEMENT_DEFS } from "@/lib/achievements";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const achievements = await prisma.userAchievement.findMany({
      where: { userId: session.user.id, tenantId: tenant.id },
      orderBy: { earnedAt: "desc" },
    });

    const enriched = achievements.map((a) => ({
      ...a,
      ...(ACHIEVEMENT_DEFS[a.achievementType] ?? {
        label: a.achievementType,
        description: "",
        icon: "🏆",
      }),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/achievements/me error:", error);
    return NextResponse.json(
      { error: "Failed to fetch achievements" },
      { status: 500 },
    );
  }
}
