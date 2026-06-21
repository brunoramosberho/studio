import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireTenant,
  requireAuth,
  getAuthContext,
  roleAtLeast,
} from "@/lib/tenant";
import { sendPushToUser, sendPushToMany, getClassPostRecipients } from "@/lib/push";
import { getUsersAvatarMeta, withAvatarMeta } from "@/lib/user-avatar-meta";

type RawComment = {
  id: string;
  body: string;
  createdAt: Date;
  parentId: string | null;
  asStudio: boolean;
  user: { id: string; name: string | null; image: string | null };
  _count: { likes: number };
  likes?: { id: string }[];
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const ctx = await getAuthContext();
    const tenant = ctx?.tenant ?? (await requireTenant());
    const currentUserId = ctx?.session.user.id ?? null;
    const { eventId } = await params;

    const comments = (await prisma.comment.findMany({
      where: { feedEventId: eventId, feedEvent: { tenantId: tenant.id } },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, image: true } },
        _count: { select: { likes: true } },
        ...(currentUserId
          ? { likes: { where: { userId: currentUserId }, select: { id: true }, take: 1 } }
          : {}),
      },
    })) as RawComment[];

    // Avatar meta only for the real (non-studio) commenters.
    const userIds = comments.filter((c) => !c.asStudio).map((c) => c.user.id);
    const avatarMeta = await getUsersAvatarMeta(userIds, tenant.id);

    const studioIdentity = {
      id: `studio:${tenant.id}`,
      name: tenant.name,
      image: tenant.appIconUrl,
      isStudio: true,
    };

    const shape = (c: RawComment) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentId: c.parentId,
      asStudio: c.asStudio,
      likeCount: c._count.likes,
      likedByMe: (c.likes?.length ?? 0) > 0,
      user: c.asStudio ? studioIdentity : withAvatarMeta(c.user, avatarMeta),
    });

    // Group into roots + replies, collapsing any deeper nesting to one level.
    const byId = new Map(comments.map((c) => [c.id, c]));
    const roots: RawComment[] = [];
    const repliesByRoot = new Map<string, RawComment[]>();
    for (const c of comments) {
      let rootId = c.parentId;
      if (rootId) {
        const parent = byId.get(rootId);
        if (parent?.parentId) rootId = parent.parentId; // collapse to root
      }
      if (!rootId) {
        roots.push(c);
      } else {
        const list = repliesByRoot.get(rootId);
        if (list) list.push(c);
        else repliesByRoot.set(rootId, [c]);
      }
    }

    const result = roots.map((r) => ({
      ...shape(r),
      replies: (repliesByRoot.get(r.id) ?? []).map(shape),
    }));

    return NextResponse.json(result);
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
    const { session, tenant, membership } = await requireAuth();

    const { eventId } = await params;
    const body = await request.json();
    const { body: commentBody, parentId, asStudio } = body as {
      body: string;
      parentId?: string;
      asStudio?: boolean;
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

    // Comment "as the studio" is only allowed for admins.
    const useAsStudio = asStudio === true && roleAtLeast(membership.role, "ADMIN");

    // Validate the parent and keep replies one level deep (a reply to a reply
    // attaches to the root).
    let finalParentId: string | null = null;
    let parentAuthorId: string | null = null;
    if (parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: parentId, feedEventId: eventId },
        select: { id: true, parentId: true, userId: true },
      });
      if (parent) {
        finalParentId = parent.parentId ?? parent.id;
        parentAuthorId = parent.userId;
      }
    }

    const created = await prisma.comment.create({
      data: {
        userId: session.user.id,
        feedEventId: eventId,
        body: commentBody.trim(),
        parentId: finalParentId,
        asStudio: useAsStudio,
      },
      include: { user: { select: { id: true, name: true, image: true } } },
    });

    const comment = {
      id: created.id,
      body: created.body,
      createdAt: created.createdAt,
      parentId: created.parentId,
      asStudio: created.asStudio,
      likeCount: 0,
      likedByMe: false,
      user: useAsStudio
        ? {
            id: `studio:${tenant.id}`,
            name: tenant.name,
            image: tenant.appIconUrl,
            isStudio: true,
          }
        : created.user,
    };

    const commenterName = useAsStudio
      ? tenant.name
      : session.user.name?.split(" ")[0] ?? "Alguien";
    const preview = commentBody.trim().slice(0, 60);

    // Notify the parent comment's author when this is a reply.
    if (finalParentId && parentAuthorId && parentAuthorId !== session.user.id) {
      sendPushToUser(
        parentAuthorId,
        {
          title: "Te respondieron",
          body: `${commenterName}: ${preview}`,
          url: `/my?post=${eventId}`,
          tag: `comment-${eventId}`,
        },
        tenant.id,
      ).catch(() => {});
    } else if (feedEvent.eventType === "CLASS_COMPLETED") {
      const payload = feedEvent.payload as Record<string, unknown>;
      const className = (payload.className as string) ?? "la clase";
      const recipients = getClassPostRecipients(payload, session.user.id);
      sendPushToMany(
        recipients,
        {
          title: `Comentario en ${className}`,
          body: `${commenterName}: ${preview}`,
          url: `/my?post=${eventId}`,
          tag: `comment-${eventId}`,
        },
        tenant.id,
      );
    } else if (feedEvent.userId !== session.user.id) {
      sendPushToUser(feedEvent.userId, {
        title: "Nuevo comentario",
        body: `${commenterName}: ${preview}`,
        url: `/my?post=${eventId}`,
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
