import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { promoteFromWaitlist } from "@/lib/waitlist";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const { classId } = await params;

    const booking = await promoteFromWaitlist(classId, tenant.id);

    if (!booking) {
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
