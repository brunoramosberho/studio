import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    include: {
      requester: { select: { id: true, name: true, image: true, email: true } },
      addressee: { select: { id: true, name: true, image: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const friends = friendships.map((f) => {
    const friend = f.requesterId === userId ? f.addressee : f.requester;
    return { ...friend, friendshipId: f.id };
  });

  const pending = await prisma.friendship.findMany({
    where: { addresseeId: userId, status: "PENDING" },
    include: {
      requester: { select: { id: true, name: true, image: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingRequests = pending.map((f) => ({
    friendshipId: f.id,
    ...f.requester,
    sentAt: f.createdAt,
  }));

  return NextResponse.json({ friends, pendingRequests });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { targetUserId } = await request.json();
  if (!targetUserId || targetUserId === session.user.id) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: session.user.id, addresseeId: targetUserId },
        { requesterId: targetUserId, addresseeId: session.user.id },
      ],
    },
  });

  if (existing) {
    if (existing.status === "DECLINED") {
      const updated = await prisma.friendship.update({
        where: { id: existing.id },
        data: { requesterId: session.user.id, addresseeId: targetUserId, status: "PENDING" },
      });
      return NextResponse.json(updated, { status: 200 });
    }
    return NextResponse.json(
      { error: "Friendship already exists", status: existing.status },
      { status: 409 },
    );
  }

  const friendship = await prisma.friendship.create({
    data: { requesterId: session.user.id, addresseeId: targetUserId },
  });

  await prisma.notification.create({
    data: {
      userId: targetUserId,
      type: "FRIEND_REQUEST",
      actorId: session.user.id,
    },
  });

  const senderName = session.user.name?.split(" ")[0] ?? "Alguien";
  sendPushToUser(targetUserId, {
    title: "Solicitud de amistad",
    body: `${senderName} quiere ser tu amigo/a`,
    url: "/my/friends",
    tag: `friend-request-${session.user.id}`,
  }).catch(() => {});

  return NextResponse.json(friendship, { status: 201 });
}
