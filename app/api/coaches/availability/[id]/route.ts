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

    // Zone restriction only applies to active one-time blocks (i.e. already
    // approved time off). Pending requests can always be cancelled, recurring
    // blocks have no date so they're always deletable, and rejected blocks
    // are cleanup.
    if (
      block.status === "active" &&
      block.type === "one_time" &&
      block.startDate
    ) {
      const zone = getZone(block.startDate, tenant);
      if (zone !== "green") {
        return NextResponse.json(
          {
            error: `Solo puedes eliminar bloques en zona verde (>${tenant.zoneYellowDays} días). Contacta al administrador.`,
          },
          { status: 403 },
        );
      }
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
