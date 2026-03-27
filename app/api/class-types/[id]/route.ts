import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");

    const { id } = await params;

    const existing = await prisma.classType.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Class type not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, duration, level, color, icon, mediaUrl, tags } = body;

    const updated = await prisma.classType.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(duration !== undefined && { duration: parseInt(duration, 10) }),
        ...(level !== undefined && { level }),
        ...(color !== undefined && { color }),
        ...(icon !== undefined && { icon: icon || null }),
        ...(mediaUrl !== undefined && { mediaUrl: mediaUrl || null }),
        ...(tags !== undefined && { tags: Array.isArray(tags) ? tags : [] }),
      },
      include: { _count: { select: { classes: true, rooms: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("PUT /api/class-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");

    const { id } = await params;

    const existing = await prisma.classType.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Class type not found" }, { status: 404 });
    }

    const classCount = await prisma.class.count({ where: { classTypeId: id, tenantId: ctx.tenant.id } });
    if (classCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: hay ${classCount} clase(s) usando esta disciplina` },
        { status: 409 },
      );
    }

    await prisma.classType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("DELETE /api/class-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
