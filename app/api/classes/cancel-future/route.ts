import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { refundAndClearWaitlist } from "@/lib/waitlist";

/**
 * POST /api/classes/cancel-future
 * Cancel all future scheduled classes, optionally filtered.
 *
 * Body:
 *   classTypeId?: string  - only cancel this class type
 *   coachId?: string      - only cancel this coach's classes
 *   from?: string         - cancel from this date (defaults to now)
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    const body = await request.json();
    const { classTypeId, coachId, from } = body;

    const where: Record<string, unknown> = {
      tenantId: ctx.tenant.id,
      status: "SCHEDULED",
      startsAt: { gt: from ? new Date(from) : new Date() },
    };

    if (classTypeId) where.classTypeId = classTypeId;
    if (coachId) where.coachId = coachId;

    const classesToCancel = await prisma.class.findMany({
      where,
      select: { id: true },
    });

    if (classesToCancel.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const result = await prisma.class.updateMany({
      where: { id: { in: classesToCancel.map((c) => c.id) } },
      data: { status: "CANCELLED" },
    });

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
    console.error("POST /api/classes/cancel-future error:", error);
    return NextResponse.json({ error: "Failed to cancel classes" }, { status: 500 });
  }
}
