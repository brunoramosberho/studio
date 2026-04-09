import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.highlight.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const highlight = await prisma.highlight.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.subtitle !== undefined && { subtitle: body.subtitle || null }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.linkUrl !== undefined && { linkUrl: body.linkUrl }),
        ...(body.isExternal !== undefined && { isExternal: body.isExternal }),
        ...(body.position !== undefined && { position: body.position }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json(highlight);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { id } = await params;

    const existing = await prisma.highlight.findFirst({
      where: { id, tenantId: tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.highlight.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
