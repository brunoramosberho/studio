import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { classId } = body;

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 },
      );
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const existingEntry = await prisma.waitlist.findFirst({
      where: { classId, userId: session.user.id },
    });

    if (existingEntry) {
      return NextResponse.json(
        { error: "Already on the waitlist for this class" },
        { status: 409 },
      );
    }

    const maxPosition = await prisma.waitlist.aggregate({
      where: { classId },
      _max: { position: true },
    });

    const position = (maxPosition._max.position ?? 0) + 1;

    const entry = await prisma.waitlist.create({
      data: {
        classId,
        userId: session.user.id,
        position,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/waitlist error:", error);
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 },
    );
  }
}
