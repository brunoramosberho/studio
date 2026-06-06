import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

// Lightweight studios list used by the admin availability form.
// Returns just id + name, sorted alphabetically.
export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN", "FRONT_DESK");
    const studios = await prisma.studio.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ studios });
  } catch (error) {
    console.error("GET /api/admin/studios error:", error);
    return NextResponse.json(
      { error: "Failed to fetch studios" },
      { status: 500 },
    );
  }
}
