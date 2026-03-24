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
    const { name, address, cityId } = body;

    const studio = await prisma.studio.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address: address || null }),
        ...(cityId !== undefined && { cityId }),
      },
      include: {
        city: { include: { country: true } },
        rooms: {
          select: { id: true, name: true, maxCapacity: true, classTypeId: true, layout: true },
          orderBy: { name: "asc" },
        },
      },
    });

    return NextResponse.json(studio);
  } catch (error) {
    console.error("PUT /api/studios/[id] error:", error);
    return NextResponse.json({ error: "Failed to update studio" }, { status: 500 });
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

    const roomCount = await prisma.room.count({ where: { studioId: id } });
    if (roomCount > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar un estudio con salas. Elimina las salas primero." },
        { status: 400 },
      );
    }

    await prisma.studio.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/studios/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete studio" }, { status: 500 });
  }
}
