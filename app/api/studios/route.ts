import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireRole } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const cityId = request.nextUrl.searchParams.get("cityId");

    const studios = await prisma.studio.findMany({
      where: {
        tenantId: tenant.id,
        ...(cityId && { cityId }),
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
      orderBy: { name: "asc" },
    });

    return NextResponse.json(studios);
  } catch (error) {
    console.error("GET /api/studios error:", error);
    return NextResponse.json({ error: "Failed to fetch studios" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const body = await request.json();
    const { name, address, cityId, latitude, longitude, productsEnabled, geofenceRadiusMeters } = body;

    if (!name || !cityId) {
      return NextResponse.json({ error: "Name and city are required" }, { status: 400 });
    }

    const studio = await prisma.studio.create({
      data: {
        name, address: address || null,
        city: { connect: { id: cityId } },
        tenant: { connect: { id: tenant.id } },
        latitude: latitude ?? null, longitude: longitude ?? null,
        productsEnabled: productsEnabled === true,
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

    return NextResponse.json(studio, { status: 201 });
  } catch (error) {
    console.error("POST /api/studios error:", error);
    return NextResponse.json({ error: "Failed to create studio" }, { status: 500 });
  }
}
