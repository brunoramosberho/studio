import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await requireTenant();

    const packages = await prisma.package.findMany({
      where: { isActive: true, tenantId: tenant.id },
      orderBy: { price: "asc" },
    });

    return NextResponse.json(packages);
  } catch (error) {
    console.error("GET /api/packages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch packages" },
      { status: 500 },
    );
  }
}
