import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, duration, level, color, icon } = body;

    const updated = await prisma.classType.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(duration !== undefined && { duration: parseInt(duration, 10) }),
        ...(level !== undefined && { level }),
        ...(color !== undefined && { color }),
        ...(icon !== undefined && { icon: icon || null }),
      },
      include: { _count: { select: { classes: true, rooms: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/class-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    const classCount = await prisma.class.count({ where: { classTypeId: id } });
    if (classCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: hay ${classCount} clase(s) usando esta disciplina` },
        { status: 409 },
      );
    }

    await prisma.classType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/class-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
