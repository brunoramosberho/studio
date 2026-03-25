import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { id } = await params;
    const body = await request.json();
    const { isPinned } = body;

    const event = await prisma.feedEvent.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!event) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (isPinned === true) {
      await prisma.feedEvent.updateMany({
        where: { tenantId: tenant.id, isPinned: true },
        data: { isPinned: false },
      });
    }

    const updated = await prisma.feedEvent.update({
      where: { id },
      data: {
        ...(typeof isPinned === "boolean" && { isPinned }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/admin/feed/[id] error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { id } = await params;

    const event = await prisma.feedEvent.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!event) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await prisma.feedEvent.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/feed/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
