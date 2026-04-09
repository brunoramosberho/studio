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
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { id: true, lifecycleStage: true },
  });

  if (!membership) return;

  const currentIndex = STAGE_ORDER.indexOf(membership.lifecycleStage);
  const newIndex = STAGE_ORDER.indexOf(stage);
  if (newIndex <= currentIndex) return;

  const timestampField = STAGE_TIMESTAMP_FIELD[stage];

  await prisma.membership.update({
    where: { userId_tenantId: { userId, tenantId } },
    data: {
      lifecycleStage: stage,
      lifecycleUpdatedAt: new Date(),
      ...(timestampField ? { [timestampField]: new Date() } : {}),
    },
  });

  await checkAndDeliverRewards(membership.id, tenantId, stage);
}
