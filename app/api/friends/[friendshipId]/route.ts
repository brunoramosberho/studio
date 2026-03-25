import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { sendPushToUser } from "@/lib/push";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ friendshipId: string }> },
) {
  const { session, tenant } = await requireAuth();

  const { friendshipId } = await params;
  const { action } = await request.json();

  if (!["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (!friendship || friendship.tenantId !== tenant.id || friendship.addresseeId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (friendship.status !== "PENDING") {
    return NextResponse.json({ error: "Already resolved" }, { status: 400 });
  }

  const updated = await prisma.friendship.update({
    where: { id: friendshipId },
    data: { status: action === "accept" ? "ACCEPTED" : "DECLINED" },
  });

  if (action === "accept") {
    await prisma.notification.create({
      data: {
        userId: friendship.requesterId,
        type: "FRIEND_ACCEPTED",
        actorId: session.user.id,
        tenantId: tenant.id,
      },
    });

    const acceptorName = session.user.name?.split(" ")[0] ?? "Alguien";
    sendPushToUser(friendship.requesterId, {
      title: "Solicitud aceptada",
      body: `${acceptorName} aceptó tu solicitud de amistad`,
      url: `/my/user/${session.user.id}`,
      tag: `friend-accepted-${session.user.id}`,
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ friendshipId: string }> },
) {
  const { session, tenant } = await requireAuth();

  const { friendshipId } = await params;

  const friendship = await prisma.friendship.findUnique({
    where: { id: friendshipId },
  });

  if (
    !friendship ||
    friendship.tenantId !== tenant.id ||
    (friendship.requesterId !== session.user.id &&
      friendship.addresseeId !== session.user.id)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });

  return NextResponse.json({ ok: true });
}
