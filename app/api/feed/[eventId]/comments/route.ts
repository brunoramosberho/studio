import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireAuth } from "@/lib/tenant";
import { sendPushToUser } from "@/lib/push";
import { getUsersAvatarMeta, withAvatarMeta } from "@/lib/user-avatar-meta";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { eventId } = await params;

    const comments = await prisma.comment.findMany({
      where: { feedEventId: eventId, feedEvent: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    const userIds = comments.map((c) => c.user.id);
    const avatarMeta = await getUsersAvatarMeta(userIds, tenant.id);
    const enriched = comments.map((c) => ({
      ...c,
      user: withAvatarMeta(c.user, avatarMeta),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/feed/[eventId]/comments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();

    const { eventId } = await params;
    const body = await request.json();
    const { body: commentBody, parentId } = body as {
      body: string;
      parentId?: string;
    };

    if (!commentBody?.trim()) {
      return NextResponse.json(
        { error: "Comment body is required" },
        { status: 400 },
      );
    }

    const feedEvent = await prisma.feedEvent.findFirst({
      where: { id: eventId, tenantId: tenant.id },
      select: { id: true, userId: true },
    });

    if (!feedEvent) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const comment = await prisma.comment.create({
      data: {
        userId: session.user.id,
        feedEventId: eventId,
        body: commentBody.trim(),
        parentId: parentId ?? null,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    if (feedEvent.userId !== session.user.id) {
      const commenterName = session.user.name?.split(" ")[0] ?? "Alguien";
      const preview = commentBody.trim().slice(0, 60);
      sendPushToUser(feedEvent.userId, {
        title: "Nuevo comentario",
        body: `${commenterName}: ${preview}`,
        url: "/my",
        tag: `comment-${eventId}`,
      }).catch(() => {});
    }

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("POST /api/feed/[eventId]/comments error:", error);
    return NextResponse.json(
      { error: "Failed to add comment" },
      { status: 500 },
    );
  }
}
