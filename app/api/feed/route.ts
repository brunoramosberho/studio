import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";

async function getFriendIds(userId: string, tenantId: string): Promise<string[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      tenantId,
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
    const tenant = await requireTenant();
    const ctx = await getAuthContext();
    const currentUserId = ctx?.session?.user?.id;

    const { searchParams } = request.nextUrl;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
    const filter = searchParams.get("filter");

    // Get user's city to scope feed geographically
    let userCityId: string | null = null;
    if (currentUserId) {
      const userLoc = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { cityId: true },
      });
      userCityId = userLoc?.cityId ?? null;
    }

    let whereClause: Record<string, unknown> = { tenantId: tenant.id, visibility: "STUDIO_WIDE" };

    if (filter === "friends" && currentUserId) {
      const friendIds = await getFriendIds(currentUserId, tenant.id);
      const friendAndSelf = [...friendIds, currentUserId];
      whereClause = {
        tenantId: tenant.id,
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
      const friendIds = await getFriendIds(currentUserId, tenant.id);
      whereClause = {
        tenantId: tenant.id,
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

    if (currentUserId) {
      filtered = filtered.filter(
        (e) => !(e.eventType === "CLASS_RESERVED" && e.userId === currentUserId),
      );
    }

    if (filter === "friends" && currentUserId) {
      const friendIds = await getFriendIds(currentUserId, tenant.id);
      const friendAndSelf = new Set([...friendIds, currentUserId]);

      filtered = filtered.filter((event) => {
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
    let items = hasMore ? filtered.slice(0, limit) : filtered;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    let bookedClassIds = new Set<string>();
    if (currentUserId) {
      const reservedClassIds = items
        .filter((e) => e.eventType === "CLASS_RESERVED")
        .map((e) => (e.payload as Record<string, unknown>)?.classId as string)
        .filter(Boolean);

      if (reservedClassIds.length > 0) {
        const myBookings = await prisma.booking.findMany({
          where: {
            userId: currentUserId,
            classId: { in: reservedClassIds },
            status: "CONFIRMED",
          },
          select: { classId: true },
        });
        bookedClassIds = new Set(myBookings.map((b) => b.classId));
      }
    }

    // Group CLASS_RESERVED events by classId into a single post
    const reservedByClass = new Map<string, typeof items>();
    const nonReserved: typeof items = [];

    for (const event of items) {
      if (event.eventType === "CLASS_RESERVED") {
        const classId = (event.payload as Record<string, unknown>)?.classId as string;
        if (classId) {
          const group = reservedByClass.get(classId) ?? [];
          group.push(event);
          reservedByClass.set(classId, group);
          continue;
        }
      }
      nonReserved.push(event);
    }

    // Resolve studio info for all class-related events
    const allClassIds = new Set<string>();
    for (const event of items) {
      const classId = (event.payload as Record<string, unknown>)?.classId as string;
      if (classId) allClassIds.add(classId);
    }

    let classStudioMap = new Map<string, { studioName: string; cityId: string }>();
    if (allClassIds.size > 0) {
      const classRooms = await prisma.class.findMany({
        where: { id: { in: [...allClassIds] } },
        select: { id: true, room: { select: { studio: { select: { name: true, cityId: true } } } } },
      });
      for (const c of classRooms) {
        classStudioMap.set(c.id, {
          studioName: c.room.studio.name,
          cityId: c.room.studio.cityId,
        });
      }
    }

    // Filter by user's city if set
    if (userCityId) {
      const cityStudioIds = new Set(
        [...classStudioMap.entries()]
          .filter(([, v]) => v.cityId === userCityId)
          .map(([k]) => k),
      );

      items = items.filter((event) => {
        const classId = (event.payload as Record<string, unknown>)?.classId as string;
        if (classId) return cityStudioIds.has(classId);
        return true;
      });
    }

    type FeedEntry = {
      id: string;
      eventType: string;
      payload: unknown;
      visibility: string;
      createdAt: Date;
      user: { id: string; name: string | null; image: string | null };
      photos: { id: string; url: string; thumbnailUrl: string | null; mimeType: string }[];
      likeCount: number;
      commentCount: number;
      liked: boolean;
      likeType: string | null;
      currentUserBooked?: boolean;
      reservedBy?: { id: string; name: string | null; image: string | null }[];
      studioName?: string;
    };

    const feed: FeedEntry[] = nonReserved.map((event) => {
      const classId = (event.payload as Record<string, unknown>)?.classId as string;
      return {
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
        studioName: classId ? classStudioMap.get(classId)?.studioName : undefined,
      };
    });

    for (const [classId, group] of reservedByClass) {
      const newest = group[0];
      const totalLikes = group.reduce((s, e) => s + e._count.likes, 0);
      const totalComments = group.reduce((s, e) => s + e._count.comments, 0);
      const anyLiked = currentUserId ? group.some((e) => e.likes.length > 0) : false;

      feed.push({
        id: newest.id,
        eventType: "CLASS_RESERVED",
        payload: newest.payload,
        visibility: newest.visibility,
        createdAt: newest.createdAt,
        user: newest.user,
        photos: [],
        likeCount: totalLikes,
        commentCount: totalComments,
        liked: anyLiked,
        likeType: anyLiked ? (group.find((e) => e.likes.length > 0)?.likes[0]?.type ?? null) : null,
        currentUserBooked: bookedClassIds.has(classId),
        reservedBy: group.map((e) => e.user),
        studioName: classStudioMap.get(classId)?.studioName,
      });
    }

    feed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ feed, nextCursor });
  } catch (error) {
    console.error("GET /api/feed error:", error);
    return NextResponse.json(
      { error: "Failed to fetch feed" },
      { status: 500 },
    );
  }
}
