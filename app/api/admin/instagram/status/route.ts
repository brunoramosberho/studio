import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const prismaAny = prisma as any;
    const ig = await prismaAny.instagramIntegration?.findUnique?.({
      where: { tenantId: tenant.id },
      select: {
        igUserId: true,
        igUsername: true,
        expiresAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      connected: !!ig,
      ...ig,
    });
  } catch (error) {
    console.error("GET /api/admin/instagram/status error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

