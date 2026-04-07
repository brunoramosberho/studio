import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const ctx = await requireRole("ADMIN");
  const body = await req.json().catch(() => ({}));
  const { memberIds } = body as { memberIds?: string[] };

  const activeWaiver = await prisma.waiver.findFirst({
    where: { tenantId: ctx.tenant.id, status: "active" },
    select: { id: true },
  });

  if (!activeWaiver) {
    return NextResponse.json(
      { error: "No active waiver" },
      { status: 400 },
    );
  }

  const signedMemberIds = (
    await prisma.waiverSignature.findMany({
      where: { tenantId: ctx.tenant.id, waiverId: activeWaiver.id },
      select: { memberId: true },
    })
  ).map((s) => s.memberId);

  const pendingMembers = await prisma.membership.findMany({
    where: {
      tenantId: ctx.tenant.id,
      role: "CLIENT",
      userId: {
        notIn: signedMemberIds,
        ...(memberIds?.length ? { in: memberIds } : {}),
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // TODO: integrate with email/push notification system
  // For now, create in-app notifications for each pending member
  const notifications = pendingMembers.map((m) => ({
    userId: m.userId,
    tenantId: ctx.tenant.id,
    type: "waiver_reminder",
    actorId: ctx.session.user.id,
  }));

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }

  return NextResponse.json({
    success: true,
    reminded: pendingMembers.length,
  });
}
