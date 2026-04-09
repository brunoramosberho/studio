import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireRole, getAuthContext } from "@/lib/tenant";
import { refundAndClearWaitlist } from "@/lib/waitlist";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { id } = await params;

    const authCtx = await getAuthContext();
    const currentUserId = authCtx?.session?.user?.id;
    const isCoachOrAdmin =
      authCtx?.membership?.role === "COACH" || authCtx?.membership?.role === "ADMIN";

    const bookingStatuses = isCoachOrAdmin
      ? ["CONFIRMED", "ATTENDED", "NO_SHOW"]
      : ["CONFIRMED", "ATTENDED"];

    const classData = await prisma.class.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: {
          select: {
            id: true, userId: true, name: true, bio: true, specialties: true, photoUrl: true, color: true, tenantId: true,
            user: { select: { name: true, image: true } },
          },
        },
        bookings: {
          where: { status: { in: bookingStatuses } },
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
                  select: { id: true, title: true, artist: true, albumArt: true, spotifyTrackId: true },
                },
              },
            },
          },
        },
        blockedSpots: {
          select: { id: true, spotNumber: true, createdAt: true },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            blockedSpots: true,
            waitlist: true,
            songRequests: true,
          },
        },
      },
    });

    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const blockedCount = classData._count.blockedSpots;
    const spotsLeft = classData.room.maxCapacity - classData._count.bookings - blockedCount;

    let friendIds = new Set<string>();
    if (currentUserId) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId: currentUserId },
            { addresseeId: currentUserId },
          ],
        },
        select: { requesterId: true, addresseeId: true },
      });
      for (const f of friendships) {
        if (f.requesterId === currentUserId) friendIds.add(f.addresseeId);
        else friendIds.add(f.requesterId);
      }
    }

    const spotMap: Record<number, {
      status: "self" | "friend" | "occupied" | "blocked";
      userName?: string | null;
      userImage?: string | null;
    }> = {};

    for (const bs of classData.blockedSpots) {
      if (bs.spotNumber != null) {
        spotMap[bs.spotNumber] = { status: isCoachOrAdmin ? "blocked" : "occupied" };
      }
    }

    for (const b of classData.bookings) {
      if (b.spotNumber == null) continue;
      if (b.userId === currentUserId) {
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

    let myWaitlistEntry: { id: string; position: number } | null = null;
    if (currentUserId) {
      const wl = await prisma.waitlist.findUnique({
        where: { classId_userId: { classId: id, userId: currentUserId } },
        select: { id: true, position: true },
      });
      if (wl) myWaitlistEntry = wl;
    }

    const coach = {
      ...classData.coach,
      name: classData.coach.name || classData.coach.user?.name || null,
    };

    return NextResponse.json({ ...classData, coach, bookings, spotsLeft, spotMap, myWaitlistEntry });
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
    const ctx = await requireRole("ADMIN", "COACH");

    const { id } = await params;

    const existing = await prisma.class.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const body = await request.json();
    const { classTypeId, coachId, startsAt, endsAt, roomId, status, notes, tag, songRequestsEnabled, songRequestCriteria, blockingNotes } = body;

    const updated = await prisma.class.update({
      where: { id },
      data: {
        ...(classTypeId && { classTypeId }),
        ...(coachId && { coachId }),
        ...(startsAt && { startsAt: new Date(startsAt) }),
        ...(endsAt && { endsAt: new Date(endsAt) }),
        ...(roomId && { roomId }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(tag !== undefined && { tag: tag || null }),
        ...(songRequestsEnabled !== undefined && { songRequestsEnabled }),
        ...(songRequestCriteria !== undefined && { songRequestCriteria: Array.isArray(songRequestCriteria) ? songRequestCriteria : [] }),
        ...(blockingNotes !== undefined && { blockingNotes: blockingNotes || null }),
      },
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: {
          include: { user: { select: { name: true, image: true } } },
        },
      },
    });

    return NextResponse.json({
      ...updated,
      coach: { ...updated.coach, name: updated.coach.name || updated.coach.user?.name || null },
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
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
    const ctx = await requireRole("ADMIN");

    const { id } = await params;

    const existing = await prisma.class.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const cancelled = await prisma.class.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    refundAndClearWaitlist(id, ctx.tenant.id).catch((err) =>
      console.error("Waitlist refund on class cancel failed:", err),
    );

    return NextResponse.json(cancelled);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("DELETE /api/classes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to cancel class" },
      { status: 500 },
    );
  }
}
