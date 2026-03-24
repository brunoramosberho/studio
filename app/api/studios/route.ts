import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const cityId = request.nextUrl.searchParams.get("cityId");

    const studios = await prisma.studio.findMany({
      where: cityId ? { cityId } : {},
      include: {
        city: { include: { country: true } },
        rooms: {
          select: { id: true, name: true, maxCapacity: true, classTypeId: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(studios);
  } catch (error) {
    console.error("GET /api/studios error:", error);
    return NextResponse.json({ error: "Failed to fetch studios" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, address, cityId } = body;

    if (!name || !cityId) {
      return NextResponse.json({ error: "Name and city are required" }, { status: 400 });
    }

    const studio = await prisma.studio.create({
      data: { name, address: address || null, cityId },
      include: {
        city: { include: { country: true } },
        rooms: {
          select: { id: true, name: true, maxCapacity: true, classTypeId: true },
          orderBy: { name: "asc" },
        },
      },
    });

    return NextResponse.json(studio, { status: 201 });
  } catch (error) {
    console.error("POST /api/studios error:", error);
    return NextResponse.json({ error: "Failed to create studio" }, { status: 500 });
  }
}
