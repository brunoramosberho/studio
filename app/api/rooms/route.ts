import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const body = await request.json();
    const { name, studioId, classTypeId, maxCapacity, layout } = body;

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
        tenantId: tenant.id,
        ...(layout !== undefined && { layout: layout ?? undefined }),
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
