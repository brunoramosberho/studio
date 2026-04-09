import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { sendPushToUser } from "@/lib/push";
import type { Prisma } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = (await request.json()) as {
      userId?: string;
      achievementKey?: string;
      rewardText?: string;
    };
    const userId = body.userId?.trim();
    const achievementKey = body.achievementKey?.trim();
    const rewardText = body.rewardText?.trim();

    if (!userId || !rewardText) {
      return NextResponse.json(
        { error: "userId y rewardText son obligatorios" },
        { status: 400 },
      );
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

    let sourceId: string | null = null;
    if (achievementKey) {
      const achievement = await prisma.achievement.findUnique({
        where: { key: achievementKey },
      });
      sourceId = achievement?.id ?? null;
    }

    const reward = await prisma.memberReward.create({
      data: {
        userId,
        tenantId: tenant.id,
        sourceType: "MANUAL",
        sourceId,
        rewardKind: "CUSTOM",
        rewardData: {
          text: rewardText,
          achievementKey: achievementKey ?? null,
          grantedBy: "admin",
        } as Prisma.InputJsonValue,
      },
    });

    sendPushToUser(
      userId,
      {
        title: "🎁 ¡Tienes un premio!",
        body: rewardText,
        url: "/my/profile",
        tag: `manual-prize-${reward.id}`,
      },
      tenant.id,
    ).catch(() => {});

    return NextResponse.json({ ok: true, rewardId: reward.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "Unauthorized" || msg === "Tenant not found") {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    if (msg === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("POST /api/admin/gamification/prize", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
