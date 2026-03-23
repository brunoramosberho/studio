import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

async function getFriendIds(userId: string): Promise<string[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return friendships.map((f) =>
    f.requesterId === userId ? f.addresseeId : f.requesterId,
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const currentUserId = session?.user?.id;

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
    const filter = searchParams.get("filter");

    let whereClause: Record<string, unknown> = { visibility: "STUDIO_WIDE" };

    if (filter === "friends" && currentUserId) {
      const friendIds = await getFriendIds(currentUserId);
      const friendAndSelf = [...friendIds, currentUserId];
      whereClause = {
        OR: [
          {
            userId: { in: friendAndSelf },
            OR: [
              { visibility: "STUDIO_WIDE" },
              { visibility: "FRIENDS_ONLY" },
            ],
          },
          {
            eventType: "CLASS_COMPLETED",
            visibility: "STUDIO_WIDE",
          },
        ],
      };
    } else if (currentUserId) {
      const friendIds = await getFriendIds(currentUserId);
      whereClause = {
        OR: [
          { visibility: "STUDIO_WIDE" },
          {
            visibility: "FRIENDS_ONLY",
            userId: { in: [...friendIds, currentUserId] },
          },
        ],
      };
    }

    const events = await prisma.feedEvent.findMany({
      where: whereClause,
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

    let filtered = events;

    if (filter === "friends" && currentUserId) {
      const friendIds = await getFriendIds(currentUserId);
      const friendAndSelf = new Set([...friendIds, currentUserId]);

      filtered = events.filter((event) => {
        if (friendAndSelf.has(event.userId)) return true;

        if (event.eventType === "CLASS_COMPLETED") {
          const payload = event.payload as Record<string, unknown> | null;
          const attendees = (payload?.attendees ?? []) as { id: string }[];
          return attendees.some((a) => friendAndSelf.has(a.id));
        }

        return false;
      });
    }

    const hasMore = filtered.length > limit;
    const items = hasMore ? filtered.slice(0, limit) : filtered;
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
