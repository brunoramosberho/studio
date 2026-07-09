import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";

// GET /api/admin/ratings?days=90
// Class ratings for the tenant: overall average + star distribution, breakdown
// by instructor and by discipline, and the full list of individual ratings
// (class, instructor, member, stars, reasons, comment, source, date) so admins
// can review and delete ones that don't make sense. days=0 (or absent) = all time.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("ratings");
    const tenantId = ctx.tenant.id;

    const daysParam = Number(request.nextUrl.searchParams.get("days") ?? "90");
    const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 0;
    const where: { tenantId: string; createdAt?: { gte: Date } } = { tenantId };
    if (days > 0) {
      where.createdAt = { gte: new Date(Date.now() - days * 86_400_000) };
    }

    const rows = await prisma.classRating.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, image: true } },
        class: {
          select: {
            id: true,
            startsAt: true,
            classType: { select: { id: true, name: true, color: true } },
            coach: { select: { id: true, name: true, photoUrl: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const byCoach = new Map<string, { name: string; sum: number; count: number }>();
    const byDiscipline = new Map<string, { name: string; color: string; sum: number; count: number }>();
    const reasonTally = new Map<string, number>();
    let sum = 0;

    for (const r of rows) {
      distribution[r.rating] = (distribution[r.rating] ?? 0) + 1;
      sum += r.rating;
      const coach = r.class.coach;
      const c = byCoach.get(coach.id) ?? { name: coach.name, sum: 0, count: 0 };
      c.sum += r.rating;
      c.count++;
      byCoach.set(coach.id, c);
      const disc = r.class.classType;
      const d = byDiscipline.get(disc.id) ?? { name: disc.name, color: disc.color, sum: 0, count: 0 };
      d.sum += r.rating;
      d.count++;
      byDiscipline.set(disc.id, d);
      for (const reason of r.reasons) {
        reasonTally.set(reason, (reasonTally.get(reason) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      days,
      summary: {
        total: rows.length,
        average: rows.length ? Math.round((sum / rows.length) * 10) / 10 : 0,
        distribution,
      },
      byCoach: [...byCoach.entries()]
        .map(([id, v]) => ({ coachId: id, name: v.name, average: Math.round((v.sum / v.count) * 10) / 10, count: v.count }))
        .sort((a, b) => a.average - b.average || b.count - a.count),
      byDiscipline: [...byDiscipline.entries()]
        .map(([id, v]) => ({ disciplineId: id, name: v.name, color: v.color, average: Math.round((v.sum / v.count) * 10) / 10, count: v.count }))
        .sort((a, b) => b.count - a.count),
      topReasons: [...reasonTally.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      ratings: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        reasons: r.reasons,
        comment: r.comment,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
        member: { id: r.user.id, name: r.user.name, image: r.user.image },
        class: {
          id: r.class.id,
          startsAt: r.class.startsAt.toISOString(),
          discipline: r.class.classType.name,
          color: r.class.classType.color,
        },
        coach: { id: r.class.coach.id, name: r.class.coach.name, photoUrl: r.class.coach.photoUrl },
      })),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Forbidden") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[admin/ratings]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
