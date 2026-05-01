import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { getEligibleCoaches } from "@/lib/substitutions";

export async function GET(req: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const coach = await prisma.coachProfile.findFirst({
      where: { userId: session.user.id, tenantId: tenant.id },
      select: { id: true },
    });
    if (!coach) {
      return NextResponse.json({ error: "Not a coach" }, { status: 403 });
    }

    const classId = req.nextUrl.searchParams.get("classId");
    if (!classId) {
      return NextResponse.json({ error: "classId required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id, coachId: coach.id },
      select: { id: true },
    });
    if (!cls) {
      return NextResponse.json(
        { error: "Class not found or you are not the assigned instructor" },
        { status: 404 },
      );
    }

    const coaches = await getEligibleCoaches(classId, tenant.id);
    return NextResponse.json({ coaches });
  } catch (error) {
    console.error("GET /api/coach/substitutions/eligible-coaches error:", error);
    return NextResponse.json(
      { error: "Failed to load coaches" },
      { status: 500 },
    );
  }
}
