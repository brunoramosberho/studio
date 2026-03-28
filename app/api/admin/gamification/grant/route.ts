import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { createGroupedAchievementEvents, grantAchievementManually } from "@/lib/achievements";

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = (await request.json()) as { userId?: string; achievementKey?: string };
    const userId = body.userId?.trim();
    const achievementKey = body.achievementKey?.trim();
    if (!userId || !achievementKey) {
      return NextResponse.json({ error: "userId y achievementKey son obligatorios" }, { status: 400 });
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
    });
    if (!membership || membership.role !== "CLIENT") {
      return NextResponse.json(
        { error: "El usuario no es cliente de este estudio" },
        { status: 400 },
      );
    }

    const granted = await grantAchievementManually(userId, tenant.id, achievementKey, {
      source: "admin",
    });
    if (!granted) {
      return NextResponse.json(
        { error: "No se pudo otorgar (logro inexistente, inactivo o ya desbloqueado)" },
        { status: 400 },
      );
    }

    await createGroupedAchievementEvents([{ userId, achievementKey: granted }], tenant.id);

    return NextResponse.json({ ok: true, achievementKey: granted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "Unauthorized" || msg === "Tenant not found") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("POST /api/admin/gamification/grant", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
