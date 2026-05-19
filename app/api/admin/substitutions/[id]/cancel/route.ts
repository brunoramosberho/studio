import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

/** Admin cancels a PENDING or PENDING_ADMIN sub request. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireRole("ADMIN");
    const { id } = await params;

    const reqRow = await prisma.substitutionRequest.findFirst({
      where: { id, tenantId: tenant.id },
      select: { status: true },
    });
    if (!reqRow) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (reqRow.status !== "PENDING" && reqRow.status !== "PENDING_ADMIN") {
      return NextResponse.json(
        { error: "Only open requests can be cancelled" },
        { status: 400 },
      );
    }

    await prisma.substitutionRequest.update({
      where: { id },
      data: {
        status: "CANCELLED",
        adminReviewedAt: new Date(),
        adminReviewedBy: session.user.id,
        respondedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/admin/substitutions/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "Failed to cancel request" },
      { status: 500 },
    );
  }
}
