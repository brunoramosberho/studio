import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  let body: {
    name?: string;
    studioId?: string;
    classTypeIds?: string[];
    maxCapacity?: number | string;
    layout?: unknown;
  } = {};
  try {
    const { tenant } = await requireRole("ADMIN");

    body = await request.json();
    const { name, studioId, classTypeIds, maxCapacity, layout } = body;

    if (!name || !studioId || !Array.isArray(classTypeIds) || classTypeIds.length === 0 || !maxCapacity) {
      return NextResponse.json(
        { error: "Name, studio, at least one discipline, and capacity are required" },
        { status: 400 },
      );
    }

    // Validate the studio + disciplines belong to this tenant, so a stale or
    // cross-tenant id surfaces as a clear message instead of an opaque 500 from
    // a failed relation connect.
    const studio = await prisma.studio.findFirst({
      where: { id: studioId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!studio) {
      return NextResponse.json(
        { error: "El estudio seleccionado no es válido." },
        { status: 400 },
      );
    }
    const validTypeCount = await prisma.classType.count({
      where: { id: { in: classTypeIds }, tenantId: tenant.id },
    });
    if (validTypeCount !== classTypeIds.length) {
      return NextResponse.json(
        { error: "Una o más disciplinas seleccionadas no son válidas." },
        { status: 400 },
      );
    }

    const room = await prisma.room.create({
      data: {
        name,
        studioId,
        classTypes: { connect: classTypeIds.map((id: string) => ({ id })) },
        maxCapacity: parseInt(String(maxCapacity), 10),
        tenantId: tenant.id,
        ...(layout !== undefined && { layout: (layout ?? undefined) as object | undefined }),
      },
      include: {
        classTypes: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Forbidden") {
        return NextResponse.json(
          { error: "Necesitas permiso de administrador para crear salas." },
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
    // Log with context so the real cause is visible in server logs, and surface
    // the actual message to the admin instead of a blind "Failed to create room".
    console.error("POST /api/rooms error:", {
      studioId: body.studioId,
      classTypeIds: body.classTypeIds,
      error,
    });
    const detail = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: `No se pudo crear la sala: ${detail}` },
      { status: 500 },
    );
  }
}
