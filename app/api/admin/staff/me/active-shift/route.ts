import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { getActiveShift } from "@/lib/staff";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const ctx = await requireRole("FRONT_DESK");
    const userId = ctx.session.user!.id!;

    const shift = await getActiveShift(ctx.tenant.id, userId);

    // Also surface the studios available for clock-in so the widget can
    // show the user where they need to be.
    const studios = await prisma.studio.findMany({
      where: {
        tenantId: ctx.tenant.id,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        geofenceRadiusMeters: true,
      },
    });

    return NextResponse.json({ shift, studios });
  } catch (error) {
    console.error("GET /api/admin/staff/me/active-shift error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
