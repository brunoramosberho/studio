import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await requireTenant();

    const coaches = await prisma.coachProfile.findMany({
      where: { tenantId: tenant.id },
      include: {
        user: { select: { name: true, email: true, image: true } },
      },
      orderBy: { user: { name: "asc" } },
    });
    return NextResponse.json(coaches);
  } catch (error) {
    console.error("GET /api/coaches error:", error);
    return NextResponse.json(
      { error: "Failed to fetch coaches" },
      { status: 500 },
    );
  }
}
