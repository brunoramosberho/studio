import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const [loyaltyLevels, systemAchievements, tenantAchievements, clientsWithProgress, maCount] =
      await Promise.all([
        prisma.loyaltyLevel.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.achievement.findMany({
          where: { tenantId: null, isSystem: true },
          orderBy: [{ category: "asc" }, { key: "asc" }],
        }),
        prisma.achievement.findMany({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.memberProgress.count({ where: { tenantId: tenant.id } }),
        prisma.memberAchievement.count({ where: { tenantId: tenant.id } }),
      ]);

    return NextResponse.json({
      loyaltyLevels: loyaltyLevels.map((l) => ({
        id: l.id,
        name: l.name,
        minClasses: l.minClasses,
        icon: l.icon,
        color: l.color,
        rewardOnUnlock: l.rewardOnUnlock,
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
        rewardType: a.rewardType,
        active: a.active,
      })),
      tenantAchievements: tenantAchievements.map((a) => ({
        id: a.id,
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        triggerType: a.triggerType,
        triggerValue: a.triggerValue,
        rewardType: a.rewardType,
        active: a.active,
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
