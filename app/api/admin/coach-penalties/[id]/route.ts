import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

// DELETE /api/admin/coach-penalties/[id] — remove a mistakenly-logged penalty.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { id } = await params;

    const existing = await prisma.coachPenalty.findFirst({
      where: { id, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.coachPenalty.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (error.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/admin/coach-penalties error:", error);
    return NextResponse.json({ error: "Failed to delete penalty" }, { status: 500 });
  }
}
