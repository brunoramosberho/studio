import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    const memberships = await prisma.membership.findMany({
      where: {
        tenantId: tenant.id,
        role: "CLIENT",
        ...(q
          ? {
              user: {
                OR: [
                  { email: { contains: q, mode: "insensitive" } },
                  { name: { contains: q, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { user: { name: "asc" } },
      take: 200,
    });

    const userIds = memberships.map((m) => m.userId);
    if (userIds.length === 0) {
      return NextResponse.json({ members: [] });
    }

    const [progressRows, achievementCounts] = await Promise.all([
      prisma.memberProgress.findMany({
        where: { tenantId: tenant.id, userId: { in: userIds } },
        include: { currentLevel: true },
      }),
      prisma.memberAchievement.groupBy({
        by: ["userId"],
        where: { tenantId: tenant.id, userId: { in: userIds } },
        _count: true,
      }),
    ]);

    const progressByUser = new Map(progressRows.map((p) => [p.userId, p]));
    const countByUser = new Map(
      achievementCounts.map((c) => [c.userId, c._count]),
    );

    const members = memberships.map((m) => {
      const p = progressByUser.get(m.userId);
      return {
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        levelName: p?.currentLevel?.name ?? null,
        levelIcon: p?.currentLevel?.icon ?? null,
        totalClasses: p?.totalClassesAttended ?? 0,
        currentStreak: p?.currentStreak ?? 0,
        achievementCount: countByUser.get(m.userId) ?? 0,
      };
    });

    return NextResponse.json({ members });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "Unauthorized" || msg === "Tenant not found") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("GET /api/admin/gamification/members", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
