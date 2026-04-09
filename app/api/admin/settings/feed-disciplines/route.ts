import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: ctx.tenant.id },
      select: { feedShowDisciplines: true, feedDisciplineThreshold: true },
    });
    return NextResponse.json(tenant);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET feed-disciplines settings error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.feedShowDisciplines !== undefined) data.feedShowDisciplines = Boolean(body.feedShowDisciplines);
    if (body.feedDisciplineThreshold !== undefined) {
      data.feedDisciplineThreshold = body.feedDisciplineThreshold != null
        ? parseInt(body.feedDisciplineThreshold, 10)
        : null;
    }

    const tenant = await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data,
      select: { feedShowDisciplines: true, feedDisciplineThreshold: true },
    });

    return NextResponse.json(tenant);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("PUT feed-disciplines settings error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
