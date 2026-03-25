import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: targetId } = await params;
  const currentUserId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      name: true,
      image: true,
      role: true,
      createdAt: true,
      coachProfile: {
        select: { id: true, bio: true, specialties: true, photoUrl: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
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
      status: "ACCEPTED",
      OR: [{ requesterId: targetId }, { addresseeId: targetId }],
    },
  });

  const isFriend = friendshipStatus === "ACCEPTED";
  const isCoach = user.role === "COACH";

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

  const base = {
    id: user.id,
    name: user.name,
    image: user.image,
    role: user.role,
    memberSince: user.createdAt,
    friendCount,
    sharedClassCount,
    friendshipStatus,
    friendshipId,
    pendingFromMe,
    isFriend,
    isCoach,
  };

  // Coach: always show upcoming classes they teach
  let coachClasses: unknown[] = [];
  if (isCoach && user.coachProfile) {
    const now = new Date();
    const raw = await prisma.class.findMany({
      where: {
        coachId: user.coachProfile.id,
        startsAt: { gt: now },
        status: "SCHEDULED",
      },
      include: {
        classType: { select: { name: true, duration: true, color: true } },
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
      duration: c.classType.duration,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      studioName: c.room.studio.name,
      spotsLeft: c.room.maxCapacity - c._count.bookings,
      currentUserBooked: myBookedSet.has(c.id),
    }));

    return NextResponse.json({
      ...base,
      coachBio: user.coachProfile.bio,
      coachSpecialties: user.coachProfile.specialties,
      coachClasses,
    });
  }

  // Not friends: limited view
  if (!isFriend) {
    return NextResponse.json(base);
  }

  // Friends: full view
  const now = new Date();

  // Past classes attended
  const pastClasses = await prisma.booking.findMany({
    where: {
      userId: targetId,
      status: "ATTENDED",
      class: { status: "COMPLETED" },
    },
    include: {
      class: {
        include: {
          classType: { select: { name: true, color: true } },
          coach: { select: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { class: { startsAt: "desc" } },
    take: 15,
  });

  // Upcoming classes
  const upcomingBookingsRaw = await prisma.booking.findMany({
    where: {
      userId: targetId,
      status: "CONFIRMED",
      class: { startsAt: { gt: now }, status: "SCHEDULED" },
    },
    include: {
      class: {
        include: {
          classType: { select: { name: true, duration: true, color: true } },
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

  const upcomingClasses = upcomingBookingsRaw.map((b) => ({
    id: b.classId,
    className: b.class.classType.name,
    color: b.class.classType.color,
    duration: b.class.classType.duration,
    coachName: b.class.coach.user.name,
    startsAt: b.class.startsAt,
    endsAt: b.class.endsAt,
    studioName: b.class.room.studio.name,
    spotsLeft: b.class.room.maxCapacity - b.class._count.bookings,
    currentUserBooked: myUpcomingSet.has(b.classId),
  }));

  const recentActivity = pastClasses.map((b) => ({
    id: b.id,
    className: b.class.classType.name,
    color: b.class.classType.color,
    coachName: b.class.coach.user.name,
    date: b.class.startsAt,
  }));

  // Feed events from this friend
  const feedEvents = await prisma.feedEvent.findMany({
    where: {
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
