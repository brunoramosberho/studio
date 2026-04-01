import { prisma } from "@/lib/db";
import { getLoyaltyTierVisual, type LoyaltyTierVisual } from "@/lib/loyalty-tier";

export interface AvatarMeta {
  hasActiveMembership: boolean;
  level: LoyaltyTierVisual | null;
}

/**
 * Batch-fetch membership status and loyalty level for a list of user IDs.
 * Returns a Map keyed by userId with { hasActiveMembership, level }.
 */
export async function getUsersAvatarMeta(
  userIds: string[],
  tenantId: string,
): Promise<Map<string, AvatarMeta>> {
  if (userIds.length === 0) return new Map();

  const unique = [...new Set(userIds)];

  const [activeSubs, progresses] = await Promise.all([
    prisma.userPackage.findMany({
      where: {
        userId: { in: unique },
        tenantId,
        expiresAt: { gt: new Date() },
        package: { type: "SUBSCRIPTION" },
      },
      select: { userId: true },
    }),
    prisma.memberProgress.findMany({
      where: {
        userId: { in: unique },
        tenantId,
        currentLevelId: { not: null },
      },
      include: { currentLevel: true },
    }),
  ]);

  const subSet = new Set(activeSubs.map((s) => s.userId));
  const levelMap = new Map<string, string>();
  for (const p of progresses) {
    if (p.currentLevel) {
      levelMap.set(p.userId, p.currentLevel.name);
    }
  }

  const result = new Map<string, AvatarMeta>();
  for (const id of unique) {
    const levelName = levelMap.get(id);
    result.set(id, {
      hasActiveMembership: subSet.has(id),
      level: levelName ? getLoyaltyTierVisual(levelName) : null,
    });
  }

  return result;
}

/** Merge avatar meta into a user object. */
export function withAvatarMeta<T extends { id: string }>(
  user: T,
  metaMap: Map<string, AvatarMeta>,
): T & AvatarMeta {
  const meta = metaMap.get(user.id) ?? { hasActiveMembership: false, level: null };
  return { ...user, ...meta };
}
