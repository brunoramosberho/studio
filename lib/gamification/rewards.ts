import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { addDays } from "date-fns";

function randomCodeSegment() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * Aplica premio de logro/nivel: registra MemberReward y efectos (créditos gratis / código descuento).
 * Los cupones Stripe se pueden enlazar después en checkout.
 */
export async function applyGamificationReward(params: {
  userId: string;
  tenantId: string;
  sourceType: "ACHIEVEMENT" | "LEVEL_UP";
  sourceId: string | null;
  rewardKind: "DISCOUNT_CODE" | "FREE_CLASS";
  rewardData: Prisma.JsonObject;
  expiresAt?: Date | null;
}) {
  const { userId, tenantId, sourceType, sourceId, rewardKind, rewardData, expiresAt } =
    params;

  await prisma.memberReward.create({
    data: {
      userId,
      tenantId,
      sourceType,
      sourceId,
      rewardKind,
      rewardData,
      expiresAt: expiresAt ?? null,
    },
  });

  if (rewardKind === "FREE_CLASS") {
    const count = Number((rewardData as { count?: number }).count ?? 1);
    await prisma.memberProgress.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { freeClassCredits: { increment: Math.max(1, count) } },
    });
  }
}

export async function applyAchievementCatalogReward(params: {
  userId: string;
  tenantId: string;
  achievementId: string;
  rewardType: "DISCOUNT_PERCENT" | "FREE_CLASS" | "NONE";
  rewardValue: unknown;
}) {
  const { userId, tenantId, achievementId, rewardType, rewardValue } = params;
  if (rewardType === "NONE") return;

  if (rewardType === "FREE_CLASS") {
    const rv = rewardValue as { count?: number } | null;
    const count = rv?.count ?? 1;
    await applyGamificationReward({
      userId,
      tenantId,
      sourceType: "ACHIEVEMENT",
      sourceId: achievementId,
      rewardKind: "FREE_CLASS",
      rewardData: { count, source: "achievement" },
    });
    return;
  }

  if (rewardType === "DISCOUNT_PERCENT") {
    const rv = rewardValue as { amount?: number } | null;
    const amount = rv?.amount ?? 10;
    const code = `KUDOS-${randomCodeSegment()}`;
    await applyGamificationReward({
      userId,
      tenantId,
      sourceType: "ACHIEVEMENT",
      sourceId: achievementId,
      rewardKind: "DISCOUNT_CODE",
      rewardData: {
        code,
        discountPercent: amount,
        singleUse: true,
      },
      expiresAt: addDays(new Date(), 90),
    });
  }
}
