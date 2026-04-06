import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getZone, getStatusForZone } from "@/lib/availability";

export async function GET() {
  try {
    const { session, tenant } = await requireRole("COACH");

    const blocks = await prisma.coachAvailabilityBlock.findMany({
      where: { tenantId: tenant.id, coachId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(blocks);
  } catch (error) {
    console.error("GET /api/coaches/availability error:", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireRole("COACH");
    const body = await request.json();

    const {
      type,
      dayOfWeek,
      startTime,
      endTime,
      startDate,
      endDate,
      isAllDay,
      reasonType,
      reasonNote,
    } = body;

    let status: "active" | "pending_approval" = "active";

    if (type === "one_time" && startDate) {
      const zone = getZone(new Date(startDate));
      status = getStatusForZone(zone);
    }

    const block = await prisma.coachAvailabilityBlock.create({
      data: {
        tenantId: tenant.id,
        coachId: session.user.id,
        type,
        dayOfWeek: dayOfWeek ?? [],
        startTime: startTime || null,
        endTime: endTime || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isAllDay: isAllDay ?? true,
        reasonType,
        reasonNote: reasonNote || null,
        status,
      },
    });

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create block";
    const isZoneError = message.includes("zona roja");
    console.error("POST /api/coaches/availability error:", error);
    return NextResponse.json(
      { error: message },
      { status: isZoneError ? 403 : 500 },
    );
  }
}
