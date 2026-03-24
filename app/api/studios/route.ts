import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const cityId = request.nextUrl.searchParams.get("cityId");

    const studios = await prisma.studio.findMany({
      where: cityId ? { cityId } : {},
      include: {
        city: { include: { country: true } },
        rooms: { select: { id: true, name: true, maxCapacity: true, classTypeId: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(studios);
  } catch (error) {
    console.error("GET /api/studios error:", error);
    return NextResponse.json({ error: "Failed to fetch studios" }, { status: 500 });
  }
}
