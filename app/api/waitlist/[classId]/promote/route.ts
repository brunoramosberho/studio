import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { promoteFromWaitlist } from "@/lib/waitlist";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const { tenant, session } = await requireRole("ADMIN", "FRONT_DESK");
    const { classId } = await params;
    const body = await request.json().catch(() => ({}));
    const { entryId, memberId, markAttended, force } = body as {
      entryId?: string;
      memberId?: string;
      markAttended?: boolean;
      force?: boolean;
    };

    const booking = await promoteFromWaitlist(classId, tenant.id, {
      waitlistEntryId: entryId,
      memberId,
      markAttended: markAttended === true,
      checkedInBy: session.user.id,
      force: force === true,
    });

    if (!booking) {
      // Distinguish a full room (front desk can force) from an empty/stale
      // waitlist so the UI can prompt for confirmation vs. just refresh.
      const remaining = await prisma.waitlist.count({
        where: { classId, tenantId: tenant.id },
      });
      if (remaining > 0 && force !== true) {
        return NextResponse.json(
          { error: "Class is full", requiresConfirmation: true },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Waitlist is empty" },
        { status: 404 },
      );
    }

    return NextResponse.json(booking);
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Forbidden"].includes(error.message)
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("POST /api/waitlist/[classId]/promote error:", error);
    return NextResponse.json(
      { error: "Failed to promote from waitlist" },
      { status: 500 },
    );
  }
}
