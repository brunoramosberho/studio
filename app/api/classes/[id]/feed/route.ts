import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enrichPayloadsWithCurrentClassType } from "@/lib/feed-class-payload-sync";
import { requireTenant, getAuthContext } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await requireTenant();
    const authCtx = await getAuthContext();
    const { id } = await params;

    const events = await prisma.feedEvent.findMany({
      where: { eventType: "CLASS_COMPLETED", tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
    });

    const feedEvent = events.find((e) => {
      const payload = e.payload as Record<string, unknown> | null;
      return payload?.classId === id;
    });

    if (!feedEvent) {
      return NextResponse.json({ feedEvent: null });
    }

    const currentUserId = authCtx?.session?.user?.id;

    const payload = feedEvent.payload
      ? { ...(feedEvent.payload as Record<string, unknown>) }
      : null;
    await enrichPayloadsWithCurrentClassType(prisma, [payload]);

    const [photos, comments, likeCount, myLike] = await Promise.all([
      prisma.photo.findMany({
        where: { feedEventId: feedEvent.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, image: true } } },
      }),
      prisma.comment.findMany({
        where: { feedEventId: feedEvent.id },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, image: true } } },
      }),
      prisma.like.count({ where: { feedEventId: feedEvent.id } }),
      currentUserId
        ? prisma.like.findUnique({
            where: {
              userId_feedEventId: {
                userId: currentUserId,
                feedEventId: feedEvent.id,
              },
            },
          })
        : null,
    ]);

    return NextResponse.json({
      feedEvent: {
        id: feedEvent.id,
        payload,
        createdAt: feedEvent.createdAt,
        photos,
        comments,
        likeCount,
        liked: !!myLike,
      },
    });
  } catch (error) {
    console.error("GET /api/classes/[id]/feed error:", error);
    return NextResponse.json(
      { error: "Failed to fetch class feed" },
      { status: 500 },
    );
  }
}
