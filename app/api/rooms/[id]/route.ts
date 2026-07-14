import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

// Turn a thrown error into a useful response: a clear 403/401 for permission
// issues (so admins don't see an opaque "Failed to …"), and the real message
// otherwise.
function roomErrorResponse(error: unknown, logLabel: string, fallback: string) {
  if (error instanceof Error) {
    if (error.message === "Forbidden") {
      return NextResponse.json(
        { error: "Necesitas permiso de administrador para gestionar salas." },
        { status: 403 },
      );
    }
    if (error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Tu sesión expiró. Vuelve a iniciar sesión." },
        { status: 401 },
      );
    }
  }
  console.error(`${logLabel} error:`, error);
  const detail = error instanceof Error ? error.message : "Error desconocido";
  return NextResponse.json({ error: `${fallback}: ${detail}` }, { status: 500 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const { id } = await params;
    const body = await request.json();
    const { name, classTypeIds, maxCapacity, layout } = body;

    const room = await prisma.room.update({
      where: { id, tenantId: tenant.id },
      data: {
        ...(name !== undefined && { name }),
        ...(Array.isArray(classTypeIds) && {
          classTypes: { set: classTypeIds.map((ctId: string) => ({ id: ctId })) },
        }),
        ...(maxCapacity !== undefined && { maxCapacity: parseInt(maxCapacity, 10) }),
        ...(layout !== undefined && { layout: layout }),
      },
      include: {
        classTypes: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(room);
  } catch (error) {
    return roomErrorResponse(error, "PUT /api/rooms/[id]", "No se pudo actualizar la sala");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const { id } = await params;

    const classCount = await prisma.class.count({ where: { roomId: id, tenantId: tenant.id } });
    if (classCount > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar una sala con clases asignadas." },
        { status: 400 },
      );
    }

    await prisma.room.delete({ where: { id, tenantId: tenant.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return roomErrorResponse(error, "DELETE /api/rooms/[id]", "No se pudo eliminar la sala");
  }
}
