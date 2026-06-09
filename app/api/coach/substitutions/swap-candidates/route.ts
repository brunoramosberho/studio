import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { getSwapCandidates } from "@/lib/substitutions";

/**
 * For a coach's own class, returns the list of OTHER coaches' future
 * classes that they could swap into. A swap is only listed if both coaches
 * could teach each other's class (discipline + availability + no time_off
 * + no scheduling conflict for the inbound side).
 *
 * Query: ?classId=<the coach's class to swap out of>
 */
export async function GET(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const coach = await prisma.coachProfile.findFirst({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const classId = request.nextUrl.searchParams.get("classId");
    if (!classId) {
      return NextResponse.json({ error: "classId required" }, { status: 400 });
    }

    // Make sure the class belongs to the requesting coach.
    const own = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id, coachId: coach.id },
      select: { id: true },
    });
    if (!own) {
      return NextResponse.json(
        { error: "Class not found or you are not the assigned instructor" },
        { status: 404 },
      );
    }

    const result = await getSwapCandidates(classId, tenant.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/coach/substitutions/swap-candidates error:", error);
    return NextResponse.json(
      { error: "Failed to load swap candidates" },
      { status: 500 },
    );
  }
}
