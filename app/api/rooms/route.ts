import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, studioId, classTypeId, maxCapacity } = body;

    if (!name || !studioId || !classTypeId || !maxCapacity) {
      return NextResponse.json(
        { error: "Name, studio, class type, and capacity are required" },
        { status: 400 },
      );
    }

    const room = await prisma.room.create({
      data: {
        name,
        studioId,
        classTypeId,
        maxCapacity: parseInt(maxCapacity, 10),
      },
      include: {
        classType: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    console.error("POST /api/rooms error:", error);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
