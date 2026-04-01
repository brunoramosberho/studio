import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { getUsersAvatarMeta, withAvatarMeta } from "@/lib/user-avatar-meta";

export async function GET() {
  const { session, tenant } = await requireAuth();

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, tenantId: tenant.id },
    include: {
      actor: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, tenantId: tenant.id, readAt: null },
  });

  const actorIds = notifications
    .map((n) => n.actor?.id)
    .filter((id): id is string => !!id);
  const avatarMeta = await getUsersAvatarMeta(actorIds, tenant.id);
  const enriched = notifications.map((n) => ({
    ...n,
    actor: n.actor ? withAvatarMeta(n.actor, avatarMeta) : null,
  }));

  return NextResponse.json({ notifications: enriched, unreadCount });
}

export async function POST(request: NextRequest) {
  const { session, tenant } = await requireAuth();

  const { action } = await request.json();

  if (action === "read-all") {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, tenantId: tenant.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
