import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enrichPayloadsWithCurrentClassType } from "@/lib/feed-class-payload-sync";
import { requireAuth } from "@/lib/tenant";
import { getUsersAvatarMeta } from "@/lib/user-avatar-meta";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: targetId } = await params;
  const currentUserId = ctx.session.user.id;
  const tenantId = ctx.tenant.id;

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      name: true,
      image: true,
      instagramUser: true,
      stravaUser: true,
      createdAt: true,
      coachProfiles: {
        where: { tenantId },
        select: { id: true, bio: true, specialties: true, photoUrl: true },
        take: 1,
      },
      memberships: {
        where: { tenantId },
        select: { role: true },
        take: 1,
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userRole = user.memberships[0]?.role ?? "CLIENT";
  const coachProfile = user.coachProfiles[0] ?? null;

  const friendship = await prisma.friendship.findFirst({
    where: {
      tenantId,
      OR: [
        { requesterId: currentUserId, addresseeId: targetId },
        { requesterId: targetId, addresseeId: currentUserId },
      ],
    },
    select: { id: true, status: true, requesterId: true },
  });

  const friendshipStatus = friendship?.status ?? null;
  const friendshipId = friendship?.id ?? null;
  const pendingFromMe = friendship?.status === "PENDING" && friendship.requesterId === currentUserId;

  const friendCount = await prisma.friendship.count({
    where: {
      tenantId,
      status: "ACCEPTED",
      OR: [{ requesterId: targetId }, { addresseeId: targetId }],
    },
  });

  const isFriend = friendshipStatus === "ACCEPTED";
  const isCoach = userRole === "COACH";

  // Shared classes (classes both users attended/booked)
  const myClassIds = await prisma.booking.findMany({
    where: { userId: currentUserId, status: { in: ["CONFIRMED", "ATTENDED"] } },
    select: { classId: true },
  });
  const myClassIdSet = new Set(myClassIds.map((b) => b.classId));

  const theirBookings = await prisma.booking.findMany({
    where: { userId: targetId, status: { in: ["CONFIRMED", "ATTENDED"] } },
    select: { classId: true },
  });
  const sharedClassCount = theirBookings.filter((b) => myClassIdSet.has(b.classId)).length;

  let loyaltyLevel: {
    name: string;
    icon: string;
    color: string;
    minClasses: number;
    sortOrder: number;
    totalClasses: number;
    currentStreak: number;
  } | null = null;

  if (userRole === "CLIENT") {
    const mp = await prisma.memberProgress.findUnique({
      where: { userId_tenantId: { userId: targetId, tenantId } },
      include: { currentLevel: true },
    });
    if (mp?.currentLevel) {
      loyaltyLevel = {
        name: mp.currentLevel.name,
        icon: mp.currentLevel.icon,
        color: mp.currentLevel.color,
        minClasses: mp.currentLevel.minClasses,
        sortOrder: mp.currentLevel.sortOrder,
        totalClasses: mp.totalClassesAttended,
        currentStreak: mp.currentStreak,
      };
    }
  }

  const avatarMeta = await getUsersAvatarMeta([targetId], tenantId);
  const meta = avatarMeta.get(targetId);

  const showSocials = isFriend || isCoach;
  const base = {
    id: user.id,
    name: user.name,
    image: coachProfile?.photoUrl || user.image,
    role: userRole,
    memberSince: user.createdAt,
    friendCount,
    sharedClassCount,
    friendshipStatus,
    friendshipId,
    pendingFromMe,
    isFriend,
    isCoach,
    loyaltyLevel,
    hasActiveMembership: meta?.hasActiveMembership ?? false,
    level: meta?.level ?? null,
    instagramUser: showSocials ? user.instagramUser : null,
    stravaUser: showSocials ? user.stravaUser : null,
  };

  // Coach: always show upcoming classes they teach
  let coachClasses: unknown[] = [];
  if (isCoach && coachProfile) {
    const now = new Date();
    const raw = await prisma.class.findMany({
      where: {
        tenantId,
        coachId: coachProfile.id,
        startsAt: { gt: now },
        status: "SCHEDULED",
      },
      include: {
        classType: { select: { name: true, duration: true, color: true, icon: true } },
        room: {
          select: {
            maxCapacity: true,
            studio: { select: { name: true } },
          },
        },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
      orderBy: { startsAt: "asc" },
      take: 10,
    });

    const classIds = raw.map((c) => c.id);
    const myBookingsForCoachClasses = await prisma.booking.findMany({
      where: {
        userId: currentUserId,
        classId: { in: classIds },
        status: "CONFIRMED",
      },
      select: { classId: true },
    });
    const myBookedSet = new Set(myBookingsForCoachClasses.map((b) => b.classId));

    coachClasses = raw.map((c) => ({
      id: c.id,
      className: c.classType.name,
      color: c.classType.color,
      icon: c.classType.icon,
      duration: c.classType.duration,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      studioName: c.room.studio.name,
      spotsLeft: c.room.maxCapacity - c._count.bookings,
      currentUserBooked: myBookedSet.has(c.id),
    }));

    return NextResponse.json({
      ...base,
      coachBio: coachProfile.bio,
      coachSpecialties: coachProfile.specialties,
      coachClasses,
    });
  }

  // Not friends: limited view
  if (!isFriend) {
    return NextResponse.json(base);
  }

  // Friends: full view
  const now = new Date();

  // Past classes attended (scoped to this tenant)
  const pastClasses = await prisma.booking.findMany({
    where: {
      userId: targetId,
      status: "ATTENDED",
      class: { tenantId, status: "COMPLETED" },
    },
    include: {
      class: {
        include: {
          classType: { select: { name: true, color: true, icon: true } },
          coach: { select: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { class: { startsAt: "desc" } },
    take: 15,
  });

  // Upcoming classes (scoped to this tenant)
  const upcomingBookingsRaw = await prisma.booking.findMany({
    where: {
      userId: targetId,
      status: "CONFIRMED",
      class: { tenantId, startsAt: { gt: now }, status: "SCHEDULED" },
    },
    include: {
      class: {
        include: {
          classType: { select: { name: true, duration: true, color: true, icon: true } },
          coach: { select: { user: { select: { name: true } } } },
          room: {
            select: {
              maxCapacity: true,
              studio: { select: { name: true } },
            },
          },
          _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
        },
      },
    },
    orderBy: { class: { startsAt: "asc" } },
    take: 10,
  });

  const upcomingClassIds = upcomingBookingsRaw.map((b) => b.classId);
  const myUpcomingBookings = await prisma.booking.findMany({
    where: {
      userId: currentUserId,
      classId: { in: upcomingClassIds },
      status: "CONFIRMED",
    },
    select: { classId: true },
  });
  const myUpcomingSet = new Set(myUpcomingBookings.map((b) => b.classId));

  // Find CLASS_RESERVED feed events for these upcoming classes
  const reservedFeedEvents = await prisma.feedEvent.findMany({
    where: {
      tenantId,
      userId: targetId,
      eventType: "CLASS_RESERVED",
    },
    include: {
      _count: { select: { likes: true, comments: true } },
      likes: {
        where: { userId: currentUserId },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const feedEventByClassId = new Map<string, typeof reservedFeedEvents[number]>();
  for (const fe of reservedFeedEvents) {
    const payload = fe.payload as Record<string, unknown>;
    const cid = payload.classId as string | undefined;
    if (cid && !feedEventByClassId.has(cid)) {
      feedEventByClassId.set(cid, fe);
    }
  }

  const upcomingClasses = upcomingBookingsRaw.map((b) => {
    const fe = feedEventByClassId.get(b.classId);
    return {
      id: b.classId,
      className: b.class.classType.name,
      color: b.class.classType.color,
      icon: b.class.classType.icon,
      duration: b.class.classType.duration,
      coachName: b.class.coach.user.name,
      startsAt: b.class.startsAt,
      endsAt: b.class.endsAt,
      studioName: b.class.room.studio.name,
      spotsLeft: b.class.room.maxCapacity - b.class._count.bookings,
      currentUserBooked: myUpcomingSet.has(b.classId),
      feedEventId: fe?.id ?? null,
      likeCount: fe?._count.likes ?? 0,
      commentCount: fe?._count.comments ?? 0,
      liked: (fe?.likes.length ?? 0) > 0,
    };
  });

  const recentActivity = pastClasses.map((b) => ({
    id: b.id,
    className: b.class.classType.name,
    color: b.class.classType.color,
    icon: b.class.classType.icon,
    coachName: b.class.coach.user.name,
    date: b.class.startsAt,
  }));

  // Feed events from this friend
  const feedEvents = await prisma.feedEvent.findMany({
    where: {
      tenantId,
      userId: targetId,
      visibility: { in: ["STUDIO_WIDE", "FRIENDS_ONLY"] },
    },
    include: {
      photos: {
        select: { id: true, url: true, thumbnailUrl: true, mimeType: true },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { likes: true, comments: true } },
      likes: {
        where: { userId: currentUserId },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  await enrichPayloadsWithCurrentClassType(
    prisma,
    feedEvents.map((e) => e.payload as Record<string, unknown> | null),
  );

  const activityFeed = feedEvents.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    payload: e.payload,
    createdAt: e.createdAt,
    likeCount: e._count.likes,
    commentCount: e._count.comments,
    liked: e.likes.length > 0,
    photos: e.photos,
  }));

  return NextResponse.json({
    ...base,
    upcomingClasses,
    recentActivity,
    activityFeed,
  });
}
