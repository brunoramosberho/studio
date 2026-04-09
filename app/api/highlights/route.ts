import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await requireTenant();

    if (!tenant.highlightsEnabled) {
      return NextResponse.json({ highlights: [], enabled: false });
    }

    const highlights = await prisma.highlight.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        linkUrl: true,
        isExternal: true,
      },
    });

    return NextResponse.json({ highlights, enabled: true });
  } catch {
    return NextResponse.json({ highlights: [], enabled: false });
  }
}
