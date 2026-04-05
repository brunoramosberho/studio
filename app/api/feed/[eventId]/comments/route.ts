import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireAuth } from "@/lib/tenant";
import { sendPushToUser, sendPushToMany, getClassPostRecipients } from "@/lib/push";
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
      select: { id: true, userId: true, eventType: true, payload: true },
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

    const commenterName = session.user.name?.split(" ")[0] ?? "Alguien";
    const preview = commentBody.trim().slice(0, 60);

    if (feedEvent.eventType === "CLASS_COMPLETED") {
      const payload = feedEvent.payload as Record<string, unknown>;
      const className = (payload.className as string) ?? "la clase";
      const recipients = getClassPostRecipients(payload, session.user.id);
      sendPushToMany(
        recipients,
        {
          title: `Comentario en ${className}`,
          body: `${commenterName}: ${preview}`,
          url: "/my",
          tag: `comment-${eventId}`,
        },
        tenant.id,
      );
    } else if (feedEvent.userId !== session.user.id) {
      sendPushToUser(feedEvent.userId, {
        title: "Nuevo comentario",
        body: `${commenterName}: ${preview}`,
        url: "/my",
        tag: `comment-${eventId}`,
      }, tenant.id).catch(() => {});
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
