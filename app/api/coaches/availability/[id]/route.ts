import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

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

    // Coaches own their calendar — deletes are always allowed. The previous
    // zone-red lock turned out to be more annoying than useful: if a coach
    // adds a wrong time-off and needs to remove it close to the date, they
    // shouldn't need an admin in the loop. Admins still see all changes via
    // the activity log and can intervene if abuse appears.
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
