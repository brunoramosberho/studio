import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function GET() {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;
    const now = new Date();

    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      select: { requesterId: true, addresseeId: true },
    });

    const friendIds = friendships.map((f) =>
      f.requesterId === userId ? f.addresseeId : f.requesterId,
    );

    if (friendIds.length === 0) return NextResponse.json([]);

    const friendBookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        userId: { in: friendIds },
        status: "CONFIRMED",
        privacy: "PUBLIC",
        class: { startsAt: { gte: now }, status: "SCHEDULED" },
      },
      select: {
        classId: true,
        user: { select: { id: true, name: true, image: true } },
      },
    });

    if (friendBookings.length === 0) return NextResponse.json([]);

    const classIds = [...new Set(friendBookings.map((b) => b.classId))];

    const myBookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        userId,
        classId: { in: classIds },
        status: "CONFIRMED",
      },
      select: { classId: true },
    });
    const myClassIds = new Set(myBookings.map((b) => b.classId));

    const availableClassIds = classIds.filter((id) => !myClassIds.has(id));
    if (availableClassIds.length === 0) return NextResponse.json([]);

    const classes = await prisma.class.findMany({
      where: { id: { in: availableClassIds }, tenantId: tenant.id },
      include: {
        classType: true,
        coach: {
          select: {
            id: true,
            name: true,
            photoUrl: true,
            user: { select: { name: true, image: true } },
          },
        },
        room: { include: { studio: { select: { name: true } } } },
        _count: {
          select: { bookings: { where: { status: "CONFIRMED" } } },
        },
      },
      orderBy: { startsAt: "asc" },
      take: 10,
    });

    const friendsByClass = new Map<string, { id: string; name: string | null; image: string | null }[]>();
    for (const fb of friendBookings) {
      if (!fb.user || myClassIds.has(fb.classId)) continue;
      const arr = friendsByClass.get(fb.classId) ?? [];
      if (!arr.some((u) => u.id === fb.user!.id)) {
        arr.push(fb.user);
      }
      friendsByClass.set(fb.classId, arr);
    }

    const result = classes.map((c) => ({
      classId: c.id,
      friendsGoing: friendsByClass.get(c.id) ?? [],
      class: {
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        classType: {
          name: c.classType.name,
          color: c.classType.color,
          duration: c.classType.duration,
          icon: c.classType.icon,
        },
        coach: {
          photoUrl: c.coach.photoUrl,
          user: c.coach.user,
        },
        room: { studio: c.room?.studio },
        spotsLeft: c.room
          ? c.room.maxCapacity - c._count.bookings
          : null,
      },
    }));

    return NextResponse.json(result.filter((r) => r.friendsGoing.length > 0));
  } catch (error) {
    console.error("GET /api/classes/friends-bookings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch friend classes" },
      { status: 500 },
    );
  }
}
