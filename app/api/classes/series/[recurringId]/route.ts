import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { refundAndClearWaitlist } from "@/lib/waitlist";

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

    // Cancel all matching classes
    const result = await prisma.class.updateMany({
      where: { id: { in: classesToCancel.map((c) => c.id) } },
      data: { status: "CANCELLED" },
    });

    // Refund waitlists asynchronously
    for (const cls of classesToCancel) {
      refundAndClearWaitlist(cls.id, ctx.tenant.id).catch((err) =>
        console.error(`Waitlist refund for class ${cls.id} failed:`, err),
      );
    }

    return NextResponse.json({ count: result.count });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("DELETE /api/classes/series/[recurringId] error:", error);
    return NextResponse.json({ error: "Failed to cancel series" }, { status: 500 });
  }
}
