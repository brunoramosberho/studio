import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { cancelClassWithRefunds } from "@/lib/class-cancel";

/**
 * GET /api/classes/series/[recurringId]
 * Get all classes in a recurring series.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ recurringId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK", "COACH");
    const { recurringId } = await params;

    const classes = await prisma.class.findMany({
      where: { recurringId, tenantId: ctx.tenant.id },
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: {
          select: {
            id: true, name: true, photoUrl: true,
            user: { select: { name: true, image: true } },
          },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json(classes);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/classes/series/[recurringId] error:", error);
    return NextResponse.json({ error: "Failed to fetch series" }, { status: 500 });
  }
}

/**
 * PUT /api/classes/series/[recurringId]
 * Update classes in a recurring series.
 * Query params:
 *   scope=all         - update all future scheduled classes in series
 *   scope=from&fromId=<classId> - update this class and all future ones in series
 * Body: partial class fields (coachId, roomId, classTypeId, tag, songRequestsEnabled, songRequestCriteria)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recurringId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { recurringId } = await params;
    const scope = request.nextUrl.searchParams.get("scope") ?? "all";
    const fromId = request.nextUrl.searchParams.get("fromId");

    const body = await request.json();
    const { coachId, roomId, classTypeId, tag, songRequestsEnabled, songRequestCriteria } = body;

    // Build the update data — only include fields that were sent
    const data: Record<string, unknown> = {};
    if (coachId !== undefined) data.coachId = coachId;
    if (roomId !== undefined) data.roomId = roomId;
    if (classTypeId !== undefined) data.classTypeId = classTypeId;
    if (tag !== undefined) data.tag = tag || null;
    if (songRequestsEnabled !== undefined) data.songRequestsEnabled = songRequestsEnabled;
    if (songRequestCriteria !== undefined) data.songRequestCriteria = Array.isArray(songRequestCriteria) ? songRequestCriteria : [];

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const where: Record<string, unknown> = {
      recurringId,
      tenantId: ctx.tenant.id,
      status: "SCHEDULED",
      startsAt: { gt: new Date() },
    };

    // If scope=from, find the class date and update only from that point
    if (scope === "from" && fromId) {
      const fromClass = await prisma.class.findFirst({
        where: { id: fromId, recurringId, tenantId: ctx.tenant.id },
        select: { startsAt: true },
      });
      if (fromClass) {
        where.startsAt = { gte: fromClass.startsAt };
      }
    }

    const result = await prisma.class.updateMany({ where, data });

    return NextResponse.json({ count: result.count });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("PUT /api/classes/series/[recurringId] error:", error);
    return NextResponse.json({ error: "Failed to update series" }, { status: 500 });
  }
}

/**
 * DELETE /api/classes/series/[recurringId]
 * Cancel all future classes in a recurring series.
 * Query params:
 *   futureOnly=true (default) - only cancel classes that haven't started yet
 *   futureOnly=false - cancel all classes in series
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ recurringId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { recurringId } = await params;
    const futureOnly = request.nextUrl.searchParams.get("futureOnly") !== "false";

    const where: Record<string, unknown> = {
      recurringId,
      tenantId: ctx.tenant.id,
      status: "SCHEDULED",
    };
    if (futureOnly) {
      where.startsAt = { gt: new Date() };
    }

    // Get the classes first to handle waitlist refunds
    const classesToCancel = await prisma.class.findMany({
      where,
      select: { id: true },
    });

    if (classesToCancel.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // Cancel each class with full refund + email flow
    let totalRefunded = 0;
    for (const cls of classesToCancel) {
      const refunded = await cancelClassWithRefunds(cls.id, ctx.tenant.id);
      totalRefunded += refunded;
    }

    return NextResponse.json({ count: classesToCancel.length, refundedBookings: totalRefunded });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("DELETE /api/classes/series/[recurringId] error:", error);
    return NextResponse.json({ error: "Failed to cancel series" }, { status: 500 });
  }
}
