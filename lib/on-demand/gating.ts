import { prisma } from "@/lib/db";

export interface OnDemandAccessResult {
  hasAccess: boolean;
  reason:
    | "active_subscription"
    | "bundled_with_package"
    | "free_video"
    | "no_access";
  subscriptionId?: string;
  expiresAt?: Date;
}

/**
 * Combine a per-tenant access decision with a per-video `isFree` flag.
 * Free videos are watchable by any signed-in user regardless of subscription
 * state — but the tenant-wide access fields (subscriptionId, expiresAt) stay
 * as-is so callers can still show the user's plan status alongside.
 */
export function videoAccess(
  tenantAccess: OnDemandAccessResult,
  isFree: boolean,
): OnDemandAccessResult {
  if (tenantAccess.hasAccess) return tenantAccess;
  if (isFree) return { hasAccess: true, reason: "free_video" };
  return tenantAccess;
}

/**
 * Decide whether a user can stream on-demand videos in a tenant.
 *
 * Two ways to qualify:
 *   1. Active MemberSubscription on a Package of type ON_DEMAND_SUBSCRIPTION.
 *   2. Active MemberSubscription on a Package with includesOnDemand=true (lets
 *      studios bundle on-demand into their unlimited tier).
 *
 * "Active" means status in ('active', 'trialing') AND currentPeriodEnd > now.
 * Cancelled subs keep access until period end (consistent with the rest of the app).
 */
export async function checkOnDemandAccess(params: {
  userId: string;
  tenantId: string;
  now?: Date;
}): Promise<OnDemandAccessResult> {
  const now = params.now ?? new Date();

  const subs = await prisma.memberSubscription.findMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      status: { in: ["active", "trialing"] },
      currentPeriodEnd: { gt: now },
    },
    include: {
      package: {
        select: {
          type: true,
          includesOnDemand: true,
        },
      },
    },
    orderBy: { currentPeriodEnd: "desc" },
  });

  for (const sub of subs) {
    if (sub.package.type === "ON_DEMAND_SUBSCRIPTION") {
      return {
        hasAccess: true,
        reason: "active_subscription",
        subscriptionId: sub.id,
        expiresAt: sub.currentPeriodEnd,
      };
    }
    if (sub.package.includesOnDemand) {
      return {
        hasAccess: true,
        reason: "bundled_with_package",
        subscriptionId: sub.id,
        expiresAt: sub.currentPeriodEnd,
      };
    }
  }

  return { hasAccess: false, reason: "no_access" };
}
