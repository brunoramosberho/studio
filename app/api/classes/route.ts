import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const typeId = searchParams.get("typeId");
    const coachId = searchParams.get("coachId");
    const level = searchParams.get("level");

    const where: Record<string, unknown> = {};

    if (from || to) {
      where.startsAt = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    if (typeId) where.classTypeId = typeId;
    if (coachId) {
      const profile = await prisma.coachProfile.findUnique({
        where: { userId: coachId },
        select: { id: true },
      });
      where.coachId = profile ? profile.id : coachId;
    }
    if (level) where.classType = { level };

    const session = await auth();
    const currentUserId = session?.user?.id;

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
        coach: {
          include: { user: { select: { name: true, image: true } } },
        },
        _count: {
          select: {
            bookings: { where: { status: "CONFIRMED" } },
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
          status: "CONFIRMED",
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
        list.push(b.user);
        friendBookings.set(b.classId, list);
      }
    }

    const result = classes.map((c) => ({
      ...c,
      friendsGoing: friendBookings.get(c.id) ?? [],
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
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { classTypeId, coachId, startsAt, endsAt, location, isRecurring, recurringId, notes } = body;

    if (!classTypeId || !coachId || !startsAt || !endsAt) {
      return NextResponse.json(
        { error: "Missing required fields: classTypeId, coachId, startsAt, endsAt" },
        { status: 400 },
      );
    }

    const newClass = await prisma.class.create({
      data: {
        classTypeId,
        coachId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        location,
        isRecurring: isRecurring ?? false,
        recurringId,
        notes,
      },
      include: {
        classType: true,
        coach: {
          include: { user: { select: { name: true, image: true } } },
        },
      },
    });

    return NextResponse.json(newClass, { status: 201 });
  } catch (error) {
    console.error("POST /api/classes error:", error);
    return NextResponse.json(
      { error: "Failed to create class" },
      { status: 500 },
    );
  }
}
