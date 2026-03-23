import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const currentUserId = session?.user?.id;

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

    const events = await prisma.feedEvent.findMany({
      where: { visibility: "STUDIO_WIDE" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, image: true } },
        photos: {
          select: { id: true, url: true, thumbnailUrl: true, mimeType: true },
          orderBy: { createdAt: "asc" as const },
        },
        _count: { select: { likes: true, comments: true } },
        ...(currentUserId && {
          likes: {
            where: { userId: currentUserId },
            select: { id: true, type: true },
            take: 1,
          },
        }),
      },
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const feed = items.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      payload: event.payload,
      visibility: event.visibility,
      createdAt: event.createdAt,
      user: event.user,
      photos: event.photos,
      likeCount: event._count.likes,
      commentCount: event._count.comments,
      liked: currentUserId ? event.likes.length > 0 : false,
      likeType: currentUserId ? event.likes[0]?.type ?? null : null,
    }));

    return NextResponse.json({ feed, nextCursor });
  } catch (error) {
    console.error("GET /api/feed error:", error);
    return NextResponse.json(
      { error: "Failed to fetch feed" },
      { status: 500 },
    );
  }
}
