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
    if (coachId) where.coachId = coachId;
    if (level) where.classType = { level };

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

    return NextResponse.json(classes);
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
