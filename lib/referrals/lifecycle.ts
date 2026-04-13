import { prisma } from "@/lib/db";
import type { MemberLifecycleStage } from "@prisma/client";
import { checkAndDeliverRewards } from "./rewards";

const STAGE_ORDER: MemberLifecycleStage[] = [
  "lead",
  "installed",
  "purchased",
  "booked",
  "attended",
  "member",
];

const STAGE_TIMESTAMP_FIELD: Partial<
  Record<MemberLifecycleStage, string>
> = {
  installed: "pwaInstalledAt",
  purchased: "firstPurchaseAt",
  booked: "firstBookingAt",
  attended: "firstAttendanceAt",
  member: "becameMemberAt",
};

export async function updateLifecycle(
  userId: string,
  tenantId: string,
  stage: MemberLifecycleStage,
) {
  const timestampField = STAGE_TIMESTAMP_FIELD[stage];

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: {
      id: true,
      lifecycleStage: true,
      ...(timestampField ? { [timestampField]: true } : {}),
    },
  });

  if (!membership) return;

  const currentIndex = STAGE_ORDER.indexOf(membership.lifecycleStage);
  const newIndex = STAGE_ORDER.indexOf(stage);
  if (newIndex <= currentIndex) return;

  // Only set the timestamp if it's not already set — avoids overwriting
  // the value recorded by the original action (e.g. pwaInstalledAt set by
  // the PWA tracker before this lifecycle transition runs).
  const existingTimestamp = timestampField
    ? (membership as Record<string, unknown>)[timestampField]
    : null;

  await prisma.membership.update({
    where: { userId_tenantId: { userId, tenantId } },
    data: {
      lifecycleStage: stage,
      lifecycleUpdatedAt: new Date(),
      ...(timestampField && !existingTimestamp
        ? { [timestampField]: new Date() }
        : {}),
    },
  });

  await checkAndDeliverRewards(membership.id, tenantId, stage);
}
