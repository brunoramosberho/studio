import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { id } = await context.params;

    const video = await prisma.onDemandVideo.findFirst({
      where: {
        id,
        tenantId: tenant.id,
        published: true,
        status: "ready",
      },
      include: {
        coachProfile: { select: { id: true, name: true, photoUrl: true, bio: true } },
        classType: { select: { id: true, name: true, color: true } },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ video });
  } catch (err) {
    console.error("GET /api/on-demand/video/[id] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
