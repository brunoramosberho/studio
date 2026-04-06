import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext, requireTenant } from "@/lib/tenant";
import { getUsersAvatarMeta, withAvatarMeta } from "@/lib/user-avatar-meta";

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

    // Parallel: user city, total attended classes, and tenant disciplines
    let userCityId: string | null = null;
    let totalClasses = 0;

    const [userLoc, memberProgress, disciplines] = await Promise.all([
      currentUserId
        ? prisma.user.findUnique({
            where: { id: currentUserId },
            select: { cityId: true },
          })
        : null,
      currentUserId
        ? prisma.memberProgress.findUnique({
            where: { userId_tenantId: { userId: currentUserId, tenantId: tenant.id } },
            select: { totalClassesAttended: true },
          })
        : null,
      prisma.classType.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          icon: true,
          mediaUrl: true,
          tags: true,
          duration: true,
          level: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    userCityId = userLoc?.cityId ?? null;
    totalClasses = memberProgress?.totalClassesAttended ?? 0;

    let whereClause: Record<string, unknown> = { tenantId: tenant.id, visibility: "STUDIO_WIDE" };

    if (currentUserId) {
      const friendIds = await getFriendIds(currentUserId, tenant.id);
      const friendAndSelf = [...friendIds, currentUserId];
      whereClause = {
        tenantId: tenant.id,
        OR: [
          // Friends + self: show everything
          {
            userId: { in: friendAndSelf },
            OR: [
              { visibility: "STUDIO_WIDE" },
              { visibility: "FRIENDS_ONLY" },
            ],
          },
          // CLASS_COMPLETED always visible (studio-wide class summaries)
          { eventType: "CLASS_COMPLETED", visibility: "STUDIO_WIDE" },
          // STUDIO_POST always visible (studio announcements)
          { eventType: "STUDIO_POST", visibility: "STUDIO_WIDE" },
        ],
      };
    }

    const feedInclude = {
      user: { select: { id: true, name: true, image: true } },
      photos: {
        select: { id: true, url: true, thumbnailUrl: true, mimeType: true, userId: true },
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
    };

    const [pinnedEvents, paginatedEvents] = await Promise.all([
      !cursor
        ? prisma.feedEvent.findMany({
            where: { ...whereClause, isPinned: true },
            orderBy: { createdAt: "desc" },
            include: feedInclude,
          })
        : Promise.resolve([]),
      prisma.feedEvent.findMany({
        where: { ...whereClause, isPinned: false },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        orderBy: { createdAt: "desc" },
        include: feedInclude,
      }),
    ]);

    const hasMore = paginatedEvents.length > limit;
    const dbPage = hasMore ? paginatedEvents.slice(0, limit) : paginatedEvents;
    const nextCursor = hasMore ? dbPage[dbPage.length - 1].id : null;
    let items = [...pinnedEvents, ...dbPage];

    if (currentUserId) {
      items = items.filter(
        (e) => !(e.eventType === "CLASS_RESERVED" && e.userId === currentUserId),
      );
    }

    items = items.filter((e) => {
      if (e.eventType !== "CLASS_COMPLETED") return true;
      const payload = e.payload as Record<string, unknown>;
      return ((payload?.attendeeCount as number) ?? 0) > 0;
    });

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

    // Resolve studio info for all class-related events
    const allClassIds = new Set<string>();
    for (const event of items) {
      const classId = (event.payload as Record<string, unknown>)?.classId as string;
      if (classId) allClassIds.add(classId);
    }

    const now = new Date();
    const endedClassIds = new Set<string>();
    const classStudioMap = new Map<string, { studioName: string; cityId: string }>();
    const classTypeMap = new Map<
      string,
      {
        name: string;
        color: string;
        icon: string | null;
        mediaUrl: string | null;
        tags: string[];
        description: string | null;
        duration: number;
        level: string;
        classTypeId: string;
        coachName: string | null;
        coachUserId: string;
        coachImage: string | null;
      }
    >();
    if (allClassIds.size > 0) {
      const classRooms = await prisma.class.findMany({
        where: { id: { in: [...allClassIds] } },
        select: {
          id: true,
          endsAt: true,
          classType: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true,
              mediaUrl: true,
              tags: true,
              description: true,
              duration: true,
              level: true,
            },
          },
          room: { select: { studio: { select: { name: true, cityId: true } } } },
          coach: { select: { userId: true, photoUrl: true, user: { select: { name: true, image: true } } } },
        },
      });
      for (const c of classRooms) {
        if (c.endsAt <= now) endedClassIds.add(c.id);
        classStudioMap.set(c.id, {
          studioName: c.room.studio.name,
          cityId: c.room.studio.cityId,
        });
        classTypeMap.set(c.id, {
          classTypeId: c.classType.id,
          name: c.classType.name,
          color: c.classType.color,
          icon: c.classType.icon,
          mediaUrl: c.classType.mediaUrl,
          tags: c.classType.tags,
          description: c.classType.description,
          duration: c.classType.duration,
          level: c.classType.level,
          coachName: c.coach.user.name,
          coachUserId: c.coach.userId,
          coachImage: c.coach.photoUrl || c.coach.user.image,
        });
      }
    }

    items = items.filter((e) => {
      if (e.eventType !== "CLASS_RESERVED") return true;
      const classId = (e.payload as Record<string, unknown>)?.classId as string;
      return !classId || !endedClassIds.has(classId);
    });

    // Check which CLASS_COMPLETED classes have playlists
    const completedClassIds = items
      .filter((e) => e.eventType === "CLASS_COMPLETED")
      .map((e) => (e.payload as Record<string, unknown>)?.classId as string)
      .filter(Boolean);

    const playlistCounts = new Set<string>();
    if (completedClassIds.length > 0) {
      const withPlaylist = await prisma.classPlaylistTrack.groupBy({
        by: ["classId"],
        where: { classId: { in: completedClassIds } },
      });
      for (const row of withPlaylist) playlistCounts.add(row.classId);
    }

    for (const event of items) {
      const payload = event.payload as Record<string, unknown> | null;
      const classId = payload?.classId as string | undefined;
      if (classId && payload) {
        const ct = classTypeMap.get(classId);
        if (ct) {
          payload.className = ct.name;
          payload.classTypeColor = ct.color;
          payload.classTypeIcon = ct.icon;
          payload.classTypeMediaUrl = ct.mediaUrl;
          payload.classTypeTags = ct.tags;
          payload.classTypeDescription = ct.description;
          payload.classTypeDuration = ct.duration;
          payload.classTypeLevel = ct.level;
          payload.classTypeId = ct.classTypeId;
          payload.coachName = ct.coachName;
          payload.coachUserId = ct.coachUserId;
          payload.coachImage = ct.coachImage;
        }
        if (event.eventType === "CLASS_COMPLETED") {
          payload.hasPlaylist = playlistCounts.has(classId);
        }
      }
    }

    // Filter by user's city — friends and self always pass through
    if (userCityId) {
      const friendIds = currentUserId
        ? new Set(await getFriendIds(currentUserId, tenant.id).then((ids) => [...ids, currentUserId]))
        : new Set<string>();

      items = items.filter((event) => {
        if (friendIds.has(event.userId)) return true;

        if (event.eventType === "STUDIO_POST") {
          const payload = event.payload as Record<string, unknown> | null;
          const targetCities = payload?.targetCityIds as string[] | null;
          if (!targetCities) return true;
          return targetCities.includes(userCityId!);
        }

        if (event.eventType === "CLASS_COMPLETED") {
          const payload = event.payload as Record<string, unknown> | null;
          const attendees = (payload?.attendees ?? []) as { id: string }[];
          if (attendees.some((a) => friendIds.has(a.id))) return true;
        }

        const classId = (event.payload as Record<string, unknown>)?.classId as string;
        if (classId) {
          const studio = classStudioMap.get(classId);
          return studio?.cityId === userCityId;
        }

        return true;
      });
    }

    // Group ACHIEVEMENT_UNLOCKED events by userId + same calendar day
    const achievementByUserDay = new Map<string, typeof items>();
    const nonAchievement: typeof items = [];

    for (const event of items) {
      if (event.eventType === "ACHIEVEMENT_UNLOCKED") {
        const day = new Date(event.createdAt).toDateString();
        const key = `${event.userId}::${day}`;
        const group = achievementByUserDay.get(key) ?? [];
        group.push(event);
        achievementByUserDay.set(key, group);
        continue;
      }
      nonAchievement.push(event);
    }

    // Merge grouped achievements back — one merged event per user-day
    const mergedItems: typeof items = [...nonAchievement];
    for (const group of achievementByUserDay.values()) {
      if (group.length === 1) {
        mergedItems.push(group[0]);
        continue;
      }
      // Merge all achievements into the newest event's payload
      const newest = group[0]; // already sorted desc by createdAt
      const allAchievements: { achievementKey: string; achievementType: string; label: string; description: string; icon: string }[] = [];
      const seenKeys = new Set<string>();
      for (const ev of group) {
        const p = ev.payload as Record<string, unknown>;
        const list = (p.achievements as typeof allAchievements) ?? [{
          achievementKey: p.achievementKey as string,
          achievementType: p.achievementType as string,
          label: p.label as string,
          description: p.description as string,
          icon: p.icon as string,
        }];
        for (const a of list) {
          if (!seenKeys.has(a.achievementKey)) {
            seenKeys.add(a.achievementKey);
            allAchievements.push(a);
          }
        }
      }
      const mergedPayload = {
        ...(newest.payload as object),
        achievements: allAchievements,
        achievementKey: allAchievements[0]?.achievementKey,
        achievementType: allAchievements[0]?.achievementType,
        label: allAchievements[0]?.label,
        description: allAchievements[0]?.description,
        icon: allAchievements[0]?.icon,
      };
      (newest as unknown as { payload: unknown }).payload = mergedPayload;
      (newest as unknown as { _count: { likes: number; comments: number } })._count = {
        likes: group.reduce((s, e) => s + e._count.likes, 0),
        comments: group.reduce((s, e) => s + e._count.comments, 0),
      };
      mergedItems.push(newest);
    }

    // Group CLASS_RESERVED events by classId into a single post
    const reservedByClass = new Map<string, typeof mergedItems>();
    const nonReserved: typeof mergedItems = [];

    for (const event of mergedItems) {
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

    type FeedEntry = {
      id: string;
      eventType: string;
      payload: unknown;
      visibility: string;
      createdAt: Date;
      user: { id: string; name: string | null; image: string | null };
      photos: { id: string; url: string; thumbnailUrl: string | null; mimeType: string; userId: string }[];
      likeCount: number;
      commentCount: number;
      liked: boolean;
      likeType: string | null;
      isPinned: boolean;
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
        isPinned: event.isPinned,
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
        isPinned: false,
        currentUserBooked: bookedClassIds.has(classId),
        reservedBy: group.map((e) => e.user),
        studioName: classStudioMap.get(classId)?.studioName,
      });
    }

    feed.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Auto-unpin expired class promo posts (fire-and-forget)
    const nowMs = now.getTime();
    const expiredPinnedIds: string[] = [];
    for (const entry of feed) {
      if (!entry.isPinned) continue;
      const pl = entry.payload as Record<string, unknown> | null;
      if (!pl?.linkedClassId || !pl.classStartsAt) continue;
      if (new Date(pl.classStartsAt as string).getTime() <= nowMs) {
        entry.isPinned = false;
        expiredPinnedIds.push(entry.id);
      }
    }
    if (expiredPinnedIds.length > 0) {
      prisma.feedEvent
        .updateMany({ where: { id: { in: expiredPinnedIds } }, data: { isPinned: false } })
        .catch(() => {});
    }

    // Enrich all user objects with avatar meta (membership + level)
    const allUserIds = new Set<string>();
    for (const entry of feed) {
      allUserIds.add(entry.user.id);
      if (entry.reservedBy) {
        for (const u of entry.reservedBy) allUserIds.add(u.id);
      }
      const payload = entry.payload as Record<string, unknown> | null;
      const attendees = (payload?.attendees ?? []) as { id: string }[];
      for (const a of attendees) allUserIds.add(a.id);
    }

    const avatarMeta = await getUsersAvatarMeta([...allUserIds], tenant.id);

    for (const entry of feed) {
      (entry as Record<string, unknown>).user = withAvatarMeta(entry.user, avatarMeta);
      if (entry.reservedBy) {
        (entry as Record<string, unknown>).reservedBy = entry.reservedBy.map((u) =>
          withAvatarMeta(u, avatarMeta),
        );
      }
      const payload = entry.payload as Record<string, unknown> | null;
      const attendees = (payload?.attendees ?? []) as { id: string; name: string; image: string | null }[];
      if (attendees.length > 0 && payload) {
        payload.attendees = attendees.map((a) => withAvatarMeta(a, avatarMeta));
      }
    }

    return NextResponse.json({ feed, nextCursor, totalClasses, disciplines });
  } catch (error) {
    console.error("GET /api/feed error:", error);
    return NextResponse.json(
      { error: "Failed to fetch feed" },
      { status: 500 },
    );
  }
}
