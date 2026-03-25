import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await getTenant();
    if (!tenant) return NextResponse.json([]);

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
    return NextResponse.json([], { status: 500 });
  }
}
