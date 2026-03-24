import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const classTypes = await prisma.classType.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { classes: true, rooms: true } },
      },
    });
    return NextResponse.json(classTypes);
  } catch (error) {
    console.error("GET /api/class-types error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, duration, level, color, icon } = body;

    if (!name || !duration || !color) {
      return NextResponse.json(
        { error: "name, duration and color are required" },
        { status: 400 },
      );
    }

    const classType = await prisma.classType.create({
      data: {
        name,
        description: description || null,
        duration: parseInt(duration, 10),
        level: level || "ALL",
        color,
        icon: icon || null,
      },
      include: { _count: { select: { classes: true, rooms: true } } },
    });

    return NextResponse.json(classType, { status: 201 });
  } catch (error) {
    console.error("POST /api/class-types error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
