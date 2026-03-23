import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const session = await auth();

    const classData = await prisma.class.findUnique({
      where: { id },
      include: {
        classType: true,
        coach: {
          include: { user: { select: { name: true, image: true } } },
        },
        bookings: {
          where: { status: { in: ["CONFIRMED", "ATTENDED"] } },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                email: true,
                birthday: true,
                createdAt: true,
                favoriteSongs: {
                  orderBy: { createdAt: "desc" },
                  take: 5,
                  select: { id: true, title: true, artist: true },
                },
              },
            },
          },
        },
        _count: {
          select: {
            bookings: { where: { status: "CONFIRMED" } },
            waitlist: true,
          },
        },
      },
    });

    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const spotsLeft = classData.classType.maxCapacity - classData._count.bookings;

    const isCoachOrAdmin =
      session?.user?.role === "COACH" || session?.user?.role === "ADMIN";

    // Build friend set for the current user (used for spot map)
    let friendIds = new Set<string>();
    if (session?.user?.id) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId: session.user.id },
            { addresseeId: session.user.id },
          ],
        },
        select: { requesterId: true, addresseeId: true },
      });
      for (const f of friendships) {
        if (f.requesterId === session.user.id) friendIds.add(f.addresseeId);
        else friendIds.add(f.requesterId);
      }
    }

    // Build spot map: spotNumber -> { status, friend info }
    const spotMap: Record<number, {
      status: "self" | "friend" | "occupied";
      userName?: string | null;
      userImage?: string | null;
    }> = {};
    for (const b of classData.bookings) {
      if (b.spotNumber == null) continue;
      if (b.userId === session?.user?.id) {
        spotMap[b.spotNumber] = { status: "self", userName: b.user?.name, userImage: b.user?.image };
      } else if (b.userId && friendIds.has(b.userId) && b.privacy !== "PRIVATE") {
        spotMap[b.spotNumber] = { status: "friend", userName: b.user?.name, userImage: b.user?.image };
      } else {
        spotMap[b.spotNumber] = { status: "occupied" };
      }
    }

    let bookings;

    if (isCoachOrAdmin && classData.bookings.length > 0) {
      const userIds = classData.bookings.filter((b) => b.user).map((b) => b.user!.id);

      const [totalCounts, coachCounts, cancelCounts, allBookingCounts] = await Promise.all([
        prisma.booking.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: { in: ["ATTENDED", "CONFIRMED"] },
          },
          _count: true,
        }),
        prisma.booking.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: { in: ["ATTENDED", "CONFIRMED"] },
            class: { coachId: classData.coachId },
          },
          _count: true,
        }),
        prisma.booking.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: { in: ["CANCELLED", "NO_SHOW"] },
          },
          _count: true,
        }),
        prisma.booking.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _count: true,
        }),
      ]);

      const totalMap = new Map(totalCounts.map((r) => [r.userId, r._count]));
      const coachMap = new Map(coachCounts.map((r) => [r.userId, r._count]));
      const cancelMap = new Map(cancelCounts.map((r) => [r.userId, r._count]));
      const allMap = new Map(allBookingCounts.map((r) => [r.userId, r._count]));

      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      bookings = classData.bookings.map((b) => {
        const uid = b.user?.id ?? "";
        const totalClasses = totalMap.get(uid) ?? 0;
        const classesWithCoach = coachMap.get(uid) ?? 0;
        const cancelled = cancelMap.get(uid) ?? 0;
        const allBookings = allMap.get(uid) ?? 0;
        const cancelRate = allBookings >= 3 ? Math.round((cancelled / allBookings) * 100) : null;
        const isNewMember = b.user ? b.user.createdAt >= thirtyDaysAgo : false;
        const isFirstEver = totalClasses <= 1;
        const isFirstWithCoach = classesWithCoach <= 1;
        const isTopClient = totalClasses >= 10;

        let birthdayLabel: string | null = null;
        if (b.user?.birthday) {
          const bday = new Date(b.user.birthday);
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
          const thisYearBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());

          if (thisYearBday.getTime() === todayDate.getTime()) {
            birthdayLabel = "today";
          } else if (thisYearBday.getTime() === yesterdayDate.getTime()) {
            birthdayLabel = "yesterday";
          } else if (thisYearBday >= todayDate && thisYearBday <= weekFromNow) {
            birthdayLabel = "this_week";
          }
        }

        return {
          ...b,
          user: b.user ? {
            ...b.user,
            favoriteSongs: b.user.favoriteSongs,
          } : null,
          stats: {
            totalClasses,
            classesWithCoach,
            isNewMember,
            isFirstEver,
            isFirstWithCoach,
            isTopClient,
            birthdayLabel,
            cancelRate,
          },
        };
      });
    } else {
      bookings = classData.bookings.map((b) => ({
        ...b,
        user: b.user ? {
          ...b.user,
          favoriteSongs: isCoachOrAdmin ? b.user.favoriteSongs : [],
        } : null,
      }));
    }

    return NextResponse.json({ ...classData, bookings, spotsLeft, spotMap });
  } catch (error) {
    console.error("GET /api/classes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch class" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || !["ADMIN", "COACH"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { startsAt, endsAt, location, status, notes } = body;

    const updated = await prisma.class.update({
      where: { id },
      data: {
        ...(startsAt && { startsAt: new Date(startsAt) }),
        ...(endsAt && { endsAt: new Date(endsAt) }),
        ...(location !== undefined && { location }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        classType: true,
        coach: {
          include: { user: { select: { name: true, image: true } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/classes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update class" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    const cancelled = await prisma.class.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json(cancelled);
  } catch (error) {
    console.error("DELETE /api/classes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to cancel class" },
      { status: 500 },
    );
  }
}
