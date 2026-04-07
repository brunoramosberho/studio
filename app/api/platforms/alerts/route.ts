import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const alerts = await prisma.platformAlert.findMany({
      where: { tenantId: tenant.id, isResolved: false },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(alerts);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/alerts error:", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}
