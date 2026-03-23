import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const coachProfile = await prisma.coachProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!coachProfile) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const attendedBookings = await prisma.booking.groupBy({
      by: ["userId"],
      where: {
        userId: { not: null },
        status: { in: ["ATTENDED", "CONFIRMED"] },
        class: { coachId: coachProfile.id },
      },
      _count: true,
      orderBy: { _count: { userId: "desc" } },
      take: 15,
    });

    const userIds = attendedBookings
      .map((b) => b.userId)
      .filter((id): id is string => id !== null);

    if (userIds.length === 0) {
      return NextResponse.json([]);
    }

    const [users, lastBookings, noShowCounts, totalCounts] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          createdAt: true,
        },
      }),
      prisma.booking.findMany({
        where: {
          userId: { in: userIds },
          status: { in: ["ATTENDED", "CONFIRMED"] },
          class: { coachId: coachProfile.id },
        },
        distinct: ["userId"],
        orderBy: { createdAt: "desc" },
        select: {
          userId: true,
          createdAt: true,
          class: {
            select: {
              startsAt: true,
              classType: { select: { name: true } },
            },
          },
        },
      }),
      prisma.booking.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          status: { in: ["CANCELLED", "NO_SHOW"] },
          class: { coachId: coachProfile.id },
        },
        _count: true,
      }),
      prisma.booking.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          status: { in: ["ATTENDED", "CONFIRMED"] },
        },
        _count: true,
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const lastMap = new Map(lastBookings.map((b) => [b.userId, b]));
    const noShowMap = new Map(noShowCounts.map((r) => [r.userId, r._count]));
    const totalMap = new Map(totalCounts.map((r) => [r.userId, r._count]));

    const result = attendedBookings
      .filter((b) => b.userId && userMap.has(b.userId))
      .map((b) => {
        const user = userMap.get(b.userId!)!;
        const last = lastMap.get(b.userId!);
        const noShows = noShowMap.get(b.userId!) ?? 0;
        const totalAll = totalMap.get(b.userId!) ?? 0;

        return {
          user: {
            id: user.id,
            name: user.name,
            image: user.image,
            email: user.email,
            memberSince: user.createdAt,
          },
          classesWithCoach: b._count,
          totalClasses: totalAll,
          noShows,
          lastClass: last
            ? {
                date: last.class.startsAt,
                className: last.class.classType.name,
              }
            : null,
        };
      });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/coach/top-clients error:", error);
    return NextResponse.json(
      { error: "Failed to fetch top clients" },
      { status: 500 },
    );
  }
}
