import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, classTypeId, maxCapacity } = body;

    const room = await prisma.room.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(classTypeId !== undefined && { classTypeId }),
        ...(maxCapacity !== undefined && { maxCapacity: parseInt(maxCapacity, 10) }),
      },
      include: {
        classType: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(room);
  } catch (error) {
    console.error("PUT /api/rooms/[id] error:", error);
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const classCount = await prisma.class.count({ where: { roomId: id } });
    if (classCount > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar una sala con clases asignadas." },
        { status: 400 },
      );
    }

    await prisma.room.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/rooms/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
