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

    let bookings;

    if (isCoachOrAdmin && classData.bookings.length > 0) {
      const userIds = classData.bookings.map((b) => b.user.id);

      const [totalCounts, coachCounts] = await Promise.all([
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
      ]);

      const totalMap = new Map(totalCounts.map((r) => [r.userId, r._count]));
      const coachMap = new Map(coachCounts.map((r) => [r.userId, r._count]));

      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      bookings = classData.bookings.map((b) => {
        const totalClasses = totalMap.get(b.user.id) ?? 0;
        const classesWithCoach = coachMap.get(b.user.id) ?? 0;
        const isNewMember = b.user.createdAt >= thirtyDaysAgo;
        const isFirstEver = totalClasses <= 1;
        const isFirstWithCoach = classesWithCoach <= 1;
        const isTopClient = totalClasses >= 10;

        let birthdayLabel: string | null = null;
        if (b.user.birthday) {
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
          user: {
            ...b.user,
            favoriteSongs: b.user.favoriteSongs,
          },
          stats: {
            totalClasses,
            classesWithCoach,
            isNewMember,
            isFirstEver,
            isFirstWithCoach,
            isTopClient,
            birthdayLabel,
          },
        };
      });
    } else {
      bookings = classData.bookings.map((b) => ({
        ...b,
        user: {
          ...b.user,
          favoriteSongs: isCoachOrAdmin ? b.user.favoriteSongs : [],
        },
      }));
    }

    return NextResponse.json({ ...classData, bookings, spotsLeft });
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
