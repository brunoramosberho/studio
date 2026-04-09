import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { MemberLifecycleStage } from "@prisma/client";

const ALL_STAGES: MemberLifecycleStage[] = [
  "lead",
  "installed",
  "purchased",
  "booked",
  "attended",
  "member",
];

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    // Lifecycle distribution
    const memberships = await prisma.membership.groupBy({
      by: ["lifecycleStage"],
      where: { tenantId, role: "CLIENT" },
      _count: true,
    });

    const lifecycleDistribution = ALL_STAGES.map((stage) => ({
      stage,
      count: memberships.find((m) => m.lifecycleStage === stage)?._count ?? 0,
    }));

    // Top referrers
    const referrersRaw = await prisma.membership.findMany({
      where: {
        tenantId,
        referrals: { some: {} },
      },
      select: {
        userId: true,
        user: { select: { name: true, image: true, email: true } },
        _count: { select: { referrals: true } },
      },
      orderBy: { referrals: { _count: "desc" } },
      take: 20,
    });

    const topReferrerIds = referrersRaw.map((r) => r.userId);

    const deliveredCounts = topReferrerIds.length > 0
      ? await prisma.referralReward.groupBy({
          by: ["membershipId"],
          where: {
            tenantId,
            type: "referrer",
            status: "delivered",
            membership: { userId: { in: topReferrerIds } },
          },
          _count: true,
        })
      : [];

    const referrerMemberships = referrersRaw.length > 0
      ? await prisma.membership.findMany({
          where: { tenantId, userId: { in: topReferrerIds } },
          select: { id: true, userId: true },
        })
      : [];

    const membershipIdToUserId = new Map(
      referrerMemberships.map((m) => [m.id, m.userId]),
    );
    const deliveredByUser = new Map<string, number>();
    for (const d of deliveredCounts) {
      const userId = membershipIdToUserId.get(d.membershipId);
      if (userId) deliveredByUser.set(userId, d._count);
    }

    const topReferrers = referrersRaw.map((r) => ({
      id: r.userId,
      name: r.user.name,
      image: r.user.image,
      email: r.user.email,
      referralCount: r._count.referrals,
      rewardsDelivered: deliveredByUser.get(r.userId) ?? 0,
    }));

    // Pending manual rewards
    const pendingManual = await prisma.referralReward.findMany({
      where: { tenantId, status: "pending", rewardType: "manual" },
      select: {
        id: true,
        rewardText: true,
        type: true,
        createdAt: true,
        membership: {
          select: {
            user: { select: { id: true, name: true, image: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const pendingRewards = pendingManual.map((r) => ({
      id: r.id,
      rewardText: r.rewardText,
      type: r.type,
      createdAt: r.createdAt,
      member: {
        id: r.membership.user.id,
        name: r.membership.user.name,
        image: r.membership.user.image,
        email: r.membership.user.email,
      },
    }));

    return NextResponse.json({
      lifecycleDistribution,
      topReferrers,
      pendingRewards,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden", "Tenant not found"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/admin/referrals/metrics error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
