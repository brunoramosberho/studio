import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const { tenant } = await requireRole("ADMIN");

    const highlights = await prisma.highlight.findMany({
      where: { tenantId: tenant.id },
      orderBy: { position: "asc" },
      include: {
        _count: { select: { clicks: true } },
      },
    });

    return NextResponse.json({
      highlights,
      highlightsEnabled: tenant.highlightsEnabled,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await req.json();

    const maxPos = await prisma.highlight.aggregate({
      where: { tenantId: tenant.id },
      _max: { position: true },
    });

    const highlight = await prisma.highlight.create({
      data: {
        tenantId: tenant.id,
        title: body.title || null,
        subtitle: body.subtitle || null,
        imageUrl: body.imageUrl,
        linkUrl: body.linkUrl,
        isExternal: body.isExternal ?? false,
        position: (maxPos._max.position ?? -1) + 1,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json(highlight, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
