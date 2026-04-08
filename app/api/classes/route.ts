import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireRole, getAuthContext } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const typeId = searchParams.get("typeId");
    const coachId = searchParams.get("coachId");
    const level = searchParams.get("level");
    const studioId = searchParams.get("studioId");

    const where: Record<string, unknown> = { tenantId: tenant.id };

    if (from || to) {
      where.startsAt = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    if (typeId) where.classTypeId = typeId;
    if (coachId) {
      const profile = await prisma.coachProfile.findFirst({
        where: { userId: coachId, tenantId: tenant.id },
        select: { id: true },
      });
      where.coachId = profile ? profile.id : coachId;
    }
    if (level) where.classType = { level };
    if (studioId) where.room = { studioId };

    const authCtx = await getAuthContext();
    const currentUserId = authCtx?.session?.user?.id;

    let friendIds: string[] = [];
    if (currentUserId) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
        },
        select: { requesterId: true, addresseeId: true },
      });
      friendIds = friendships.map((f) =>
        f.requesterId === currentUserId ? f.addresseeId : f.requesterId,
      );
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: {
          select: {
            id: true,
            userId: true,
            photoUrl: true,
            color: true,
            bio: true,
            specialties: true,
            tenantId: true,
            user: { select: { name: true, image: true } },
          },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            waitlist: true,
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    // Fetch friend bookings in a single query
    let friendBookings: Map<string, { id: string; name: string | null; image: string | null }[]> = new Map();
    if (friendIds.length > 0) {
      const classIds = classes.map((c) => c.id);
      const fBookings = await prisma.booking.findMany({
        where: {
          classId: { in: classIds },
          status: { in: ["CONFIRMED", "ATTENDED"] },
          privacy: "PUBLIC",
          userId: { in: friendIds },
        },
        select: {
          classId: true,
          user: { select: { id: true, name: true, image: true } },
        },
      });
      for (const b of fBookings) {
        if (!b.user) continue;
        const list = friendBookings.get(b.classId) ?? [];
        if (!list.some((u) => u.id === b.user!.id)) {
          list.push(b.user);
        }
        friendBookings.set(b.classId, list);
      }
    }

    let myBookingMap = new Map<string, string>();
    if (currentUserId) {
      const classIds = classes.map((c) => c.id);
      const myBookings = await prisma.booking.findMany({
        where: {
          classId: { in: classIds },
          status: { in: ["CONFIRMED", "ATTENDED"] },
          userId: currentUserId,
        },
        select: { id: true, classId: true },
      });
      for (const b of myBookings) myBookingMap.set(b.classId, b.id);
    }

    const result = classes.map((c) => ({
      ...c,
      coach: { ...c.coach, name: c.coach.user?.name ?? null },
      friendsGoing: friendBookings.get(c.id) ?? [],
      isBooked: myBookingMap.has(c.id),
      myBookingId: myBookingMap.get(c.id) ?? null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/classes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch classes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    const body = await request.json();
    const { classTypeId, coachId, startsAt, endsAt, roomId, isRecurring, recurringId, notes, tag, songRequestsEnabled, songRequestCriteria } = body;

    const resolvedSongEnabled = songRequestsEnabled ?? true;
    const resolvedSongCriteria = !resolvedSongEnabled
      ? (Array.isArray(songRequestCriteria) ? songRequestCriteria : [])
      : Array.isArray(songRequestCriteria) && songRequestCriteria.length > 0
        ? songRequestCriteria
        : ["ALL"];

    if (!classTypeId || !coachId || !startsAt || !endsAt || !roomId) {
      return NextResponse.json(
        { error: "Missing required fields: classTypeId, coachId, startsAt, endsAt, roomId" },
        { status: 400 },
      );
    }

    const newClass = await prisma.class.create({
      data: {
        tenantId: ctx.tenant.id,
        classTypeId,
        coachId,
        roomId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        isRecurring: isRecurring ?? false,
        recurringId,
        notes,
        tag: tag || null,
        songRequestsEnabled: resolvedSongEnabled,
        songRequestCriteria: resolvedSongCriteria,
      },
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: {
          select: {
            id: true,
            userId: true,
            photoUrl: true,
            color: true,
            bio: true,
            specialties: true,
            tenantId: true,
            user: { select: { name: true, image: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ...newClass,
      coach: { ...newClass.coach, name: newClass.coach.user?.name ?? null },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/classes error:", error);
    return NextResponse.json(
      { error: "Failed to create class" },
      { status: 500 },
    );
  }
}
