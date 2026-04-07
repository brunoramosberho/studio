import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant, session } = await requireRole("ADMIN");
    const { id } = await params;

    const alert = await prisma.platformAlert.findFirst({
      where: { id, tenantId: tenant.id },
    });

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const updated = await prisma.platformAlert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: session.user.id,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/platforms/alerts/[id]/resolve error:", error);
    return NextResponse.json({ error: "Failed to resolve alert" }, { status: 500 });
  }
}
