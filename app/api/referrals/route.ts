import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { getOrCreateReferralCode } from "@/lib/referrals/code";

const STAGE_ORDER = ["lead", "installed", "purchased", "booked", "attended", "member"] as const;

export async function GET() {
  try {
    const ctx = await requireAuth();
    const { session, tenant } = ctx;

    const code = await getOrCreateReferralCode(session.user.id, tenant.id);

    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";
    const protocol = rootDomain.includes("localhost") ? "http" : "https";
    const shareUrl = `${protocol}://${tenant.slug}.${rootDomain}/install?ref=${code}`;

    const config = await prisma.referralConfig.findUnique({
      where: { tenantId: tenant.id },
      select: {
        referrerRewardText: true,
        referrerRewardWhen: true,
        refereeRewardText: true,
        triggerStage: true,
        isEnabled: true,
      },
    });

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
      select: { id: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    const referrals = await prisma.membership.findMany({
      where: { referredByMembershipId: membership.id, tenantId: tenant.id },
      select: {
        id: true,
        userId: true,
        lifecycleStage: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rewards = await prisma.referralReward.findMany({
      where: { membershipId: membership.id, tenantId: tenant.id, type: "referrer" },
      select: { referralId: true, status: true },
    });

    const rewardsByReferral = new Map(
      rewards.map((r) => [r.referralId, r.status]),
    );

    const referralList = referrals.map((ref) => {
      const stageIndex = STAGE_ORDER.indexOf(ref.lifecycleStage);
      const stagesCompleted = STAGE_ORDER.slice(0, stageIndex + 1);

      return {
        id: ref.userId,
        name: ref.user.name,
        image: ref.user.image,
        lifecycleStage: ref.lifecycleStage,
        joinedAt: ref.createdAt,
        rewardStatus: rewardsByReferral.get(ref.id) ?? null,
        stagesCompleted,
      };
    });

    const delivered = referralList.filter((r) => r.rewardStatus === "delivered").length;
    const pending = referralList.filter(
      (r) => r.rewardStatus === null || r.rewardStatus === "pending",
    ).length;

    return NextResponse.json({
      code,
      shareUrl,
      config: config
        ? {
            isEnabled: config.isEnabled,
            referrerRewardText: config.referrerRewardText,
            referrerRewardWhen: config.referrerRewardWhen,
            refereeRewardText: config.refereeRewardText,
            triggerStage: config.triggerStage,
          }
        : null,
      stats: { total: referralList.length, delivered, pending },
      referrals: referralList,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Tenant not found", "Not a member of this studio"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("GET /api/referrals error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
