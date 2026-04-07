import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getZone } from "@/lib/availability";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, tenant } = await requireRole("COACH");
    const { id } = await params;

    const block = await prisma.coachAvailabilityBlock.findFirst({
      where: { id, tenantId: tenant.id, coachId: session.user.id },
    });

    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    if (block.type === "one_time" && block.startDate) {
      const zone = getZone(block.startDate, tenant);
      if (zone !== "green") {
        return NextResponse.json(
          { error: `Solo puedes eliminar bloques en zona verde (>${tenant.zoneYellowDays} días)` },
          { status: 403 },
        );
      }
    }

    if (block.status !== "active") {
      return NextResponse.json(
        { error: "Solo puedes eliminar bloques activos" },
        { status: 403 },
      );
    }

    await prisma.coachAvailabilityBlock.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/coaches/availability/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete block" },
      { status: 500 },
    );
  }
}
