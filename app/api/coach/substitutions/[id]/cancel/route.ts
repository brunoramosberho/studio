import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireAuth();
    const { id } = await params;

    const coach = await prisma.coachProfile.findFirst({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const updated = await prisma.substitutionRequest.updateMany({
      where: {
        id,
        tenantId: tenant.id,
        requestingCoachId: coach.id,
        status: "PENDING",
      },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Request not found or no longer pending" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/coach/substitutions/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "Failed to cancel request" },
      { status: 500 },
    );
  }
}
