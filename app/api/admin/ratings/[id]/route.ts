import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";

// DELETE /api/admin/ratings/[id] — remove a rating that doesn't make sense.
// Scoped to the tenant so a stray id can't delete another studio's rating.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requirePermission("ratings");
    const { id } = await params;

    const result = await prisma.classRating.deleteMany({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Forbidden") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[admin/ratings/delete]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
