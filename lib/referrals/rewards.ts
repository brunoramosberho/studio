import { prisma } from "@/lib/db";
import type { MemberLifecycleStage, ReferralRewardType } from "@prisma/client";

export async function checkAndDeliverRewards(
  membershipId: string,
  tenantId: string,
  newStage: MemberLifecycleStage,
) {
  const membership = await prisma.membership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      userId: true,
      referredByMembershipId: true,
      tenant: { select: { id: true, slug: true } },
    },
  });

  if (!membership) return;

  const config = await prisma.referralConfig.findUnique({
    where: { tenantId },
  });

  if (!config?.isEnabled) return;
  if (newStage !== config.triggerStage) return;

  // 1. Reward for the referee (the new member who was invited)
  if (membership.referredByMembershipId) {
    const existingRefereeReward = await prisma.referralReward.findFirst({
      where: {
        membershipId: membership.id,
        type: "referee",
        tenantId,
      },
    });

    if (!existingRefereeReward) {
      await prisma.referralReward.create({
        data: {
          tenantId,
          membershipId: membership.id,
          referralId: membership.id,
          type: "referee",
          rewardType: config.refereeRewardType,
          rewardValue: config.refereeRewardValue,
          rewardText: config.refereeRewardText,
          status: "pending",
        },
      });
      await applyReward(
        membership.id,
        membership.userId,
        tenantId,
        config.refereeRewardType,
        config.refereeRewardValue,
      );
    }
  }

  // 2. Reward for the referrer (the member who invited)
  if (membership.referredByMembershipId) {
    const existingReferrerReward = await prisma.referralReward.findFirst({
      where: {
        membershipId: membership.referredByMembershipId,
        referralId: membership.id,
        type: "referrer",
        tenantId,
      },
    });

    if (!existingReferrerReward) {
      await prisma.referralReward.create({
        data: {
          tenantId,
          membershipId: membership.referredByMembershipId,
          referralId: membership.id,
          type: "referrer",
          rewardType: config.referrerRewardType,
          rewardValue: config.referrerRewardValue,
          rewardText: config.referrerRewardText,
          status: "pending",
        },
      });
      const referrerMembership = await prisma.membership.findUnique({
        where: { id: membership.referredByMembershipId },
        select: { userId: true },
      });
      if (referrerMembership) {
        await applyReward(
          membership.referredByMembershipId,
          referrerMembership.userId,
          tenantId,
          config.referrerRewardType,
          config.referrerRewardValue,
        );
        await notifyReferrerRewardUnlocked(
          referrerMembership.userId,
          membership.userId,
          tenantId,
        );
      }
    }
  }
}

async function applyReward(
  membershipId: string,
  userId: string,
  tenantId: string,
  type: ReferralRewardType,
  value: number | null,
) {
  switch (type) {
    case "class_credit":
      // TODO: Connect with credit system — add `value` class credits to
      // MemberProgress.freeClassCredits or create UserPackage entries.
      // For now the reward stays as 'pending' until manually delivered.
      break;

    case "days_free":
      // TODO: Connect with Stripe subscription — extend active MemberSubscription
      // trial by `value` days via Stripe API (stripe.subscriptions.update with
      // trial_end). For now the reward stays as 'pending'.
      break;

    case "discount":
      // TODO: Connect with discount/coupon system — create a single-use
      // Stripe coupon or in-app discount code for `value`% off.
      break;

    case "manual":
      await notifyAdminManualReward(userId, tenantId);
      break;
  }

  if (type === "manual") {
    await prisma.referralReward.updateMany({
      where: { membershipId, tenantId, status: "pending", rewardType: "manual" },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  }
}

async function notifyReferrerRewardUnlocked(
  referrerUserId: string,
  referredUserId: string,
  tenantId: string,
) {
  const referred = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { name: true },
  });

  const referredName = referred?.name?.split(" ")[0] ?? "Tu amigo/a";

  await prisma.notification.create({
    data: {
      userId: referrerUserId,
      tenantId,
      type: "referral_reward",
      actorId: referredUserId,
    },
  });

  console.log(
    `[Referral] Reward unlocked for referrer ${referrerUserId}: ${referredName} completed the trigger stage`,
  );
}

async function notifyAdminManualReward(userId: string, tenantId: string) {
  const admins = await prisma.membership.findMany({
    where: { tenantId, role: "ADMIN" },
    select: { userId: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.userId,
        tenantId,
        type: "referral_manual_reward",
        actorId: userId,
      },
    });
  }

  console.log(
    `[Referral] Manual reward pending for ${user?.name ?? user?.email} — admin notification created`,
  );
}
