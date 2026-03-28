import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { refundWaitlistEntry, reorderWaitlistPositions } from "@/lib/waitlist";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  try {
    const { session, tenant, membership } = await requireAuth();
    const { entryId } = await params;

    const entry = await prisma.waitlist.findFirst({
      where: { id: entryId, tenantId: tenant.id },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Waitlist entry not found" },
        { status: 404 },
      );
    }

    const isOwner = entry.userId === session.user.id;
    const isAdmin = membership.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await refundWaitlistEntry(entry);
    await prisma.waitlist.delete({ where: { id: entryId } });
    await reorderWaitlistPositions(entry.classId, tenant.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/waitlist/entry/[entryId] error:", error);
    return NextResponse.json(
      { error: "Failed to leave waitlist" },
      { status: 500 },
    );
  }
}
