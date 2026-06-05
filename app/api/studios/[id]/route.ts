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
    const { name, address, cityId, latitude, longitude, productsEnabled, geofenceRadiusMeters, isActive } = body;

    const studio = await prisma.studio.update({
      where: { id, tenantId: tenant.id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address: address || null }),
        ...(cityId !== undefined && { city: { connect: { id: cityId } } }),
        ...(latitude !== undefined && { latitude: latitude ?? null }),
        ...(longitude !== undefined && { longitude: longitude ?? null }),
        ...(productsEnabled !== undefined && { productsEnabled: productsEnabled === true }),
        ...(isActive !== undefined && { isActive: isActive === true }),
        ...(typeof geofenceRadiusMeters === "number" && geofenceRadiusMeters > 0
          ? { geofenceRadiusMeters: Math.min(2000, Math.max(20, Math.round(geofenceRadiusMeters))) }
          : {}),
      },
      include: {
        city: { include: { country: true } },
        rooms: {
          select: {
            id: true, name: true, maxCapacity: true, layout: true,
            classTypes: { select: { id: true, name: true } },
          },
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
    const { tenant } = await requireRole("ADMIN");

    const { id } = await params;

    // A studio with rooms has (or had) classes hanging off it, so hard
    // deleting would orphan history. Deactivate instead: it stays for
    // accounting but disappears from every public-facing surface.
    const roomCount = await prisma.room.count({ where: { studioId: id, tenantId: tenant.id } });
    if (roomCount > 0) {
      await prisma.studio.update({ where: { id, tenantId: tenant.id }, data: { isActive: false } });
      return NextResponse.json({ ok: true, deactivated: true, roomCount });
    }

    await prisma.studio.delete({ where: { id, tenantId: tenant.id } });
    return NextResponse.json({ ok: true, deactivated: false });
  } catch (error) {
    console.error("DELETE /api/studios/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete studio" }, { status: 500 });
  }
}
