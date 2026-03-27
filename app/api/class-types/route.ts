import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await requireTenant();

    const classTypes = await prisma.classType.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { classes: true, rooms: true } },
      },
    });
    return NextResponse.json(classTypes);
  } catch (error) {
    console.error("GET /api/class-types error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    const body = await request.json();
    const { name, description, duration, level, color, icon, mediaUrl, tags } = body;

    if (!name || !duration || !color) {
      return NextResponse.json(
        { error: "name, duration and color are required" },
        { status: 400 },
      );
    }

    const classType = await prisma.classType.create({
      data: {
        tenantId: ctx.tenant.id,
        name,
        description: description || null,
        duration: parseInt(duration, 10),
        level: level || "ALL",
        color,
        icon: icon || null,
        mediaUrl: mediaUrl || null,
        tags: Array.isArray(tags) ? tags : [],
      },
      include: { _count: { select: { classes: true, rooms: true } } },
    });

    return NextResponse.json(classType, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/class-types error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
