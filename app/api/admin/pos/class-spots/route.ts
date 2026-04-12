import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const classId = request.nextUrl.searchParams.get("classId");

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 },
      );
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      include: {
        room: { select: { maxCapacity: true, layout: true } },
        bookings: {
          where: { status: { in: ["CONFIRMED", "ATTENDED"] } },
          select: {
            spotNumber: true,
            user: { select: { name: true, image: true } },
          },
        },
        blockedSpots: { select: { spotNumber: true } },
        coach: {
          select: { name: true, user: { select: { name: true } } },
        },
      },
    });

    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const layout = cls.room.layout as {
      rows: number;
      cols: number;
      spots: { spot: number; row: number; col: number }[];
      coachPosition: { row: number; col: number } | null;
    } | null;

    const hasLayout = layout && layout.spots?.length > 0;

    if (!hasLayout) {
      return NextResponse.json({ hasLayout: false });
    }

    const spotMap: Record<
      number,
      { status: "occupied" | "blocked"; userName?: string | null }
    > = {};

    for (const bs of cls.blockedSpots) {
      if (bs.spotNumber != null) {
        spotMap[bs.spotNumber] = { status: "blocked" };
      }
    }

    for (const b of cls.bookings) {
      if (b.spotNumber == null) continue;
      spotMap[b.spotNumber] = {
        status: "occupied",
        userName: b.user?.name ?? null,
      };
    }

    return NextResponse.json({
      hasLayout: true,
      layout,
      maxCapacity: cls.room.maxCapacity,
      spotMap,
      coachName: cls.coach?.name || cls.coach?.user?.name || null,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 },
      );
    }
    console.error("GET /api/admin/pos/class-spots error:", error);
    return NextResponse.json(
      { error: "Failed to fetch class spots" },
      { status: 500 },
    );
  }
}
