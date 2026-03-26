import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;
    const body = await request.json();
    const { name, description, price, currency, imageUrl, isVisible, isActive, externalUrl, categoryId } = body;

    const existing = await prisma.product.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    if (categoryId) {
      const cat = await prisma.productCategory.findFirst({
        where: { id: categoryId, tenantId: ctx.tenant.id },
      });
      if (!cat) {
        return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(price !== undefined ? { price: Number(price) } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
        ...(isVisible !== undefined ? { isVisible } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(externalUrl !== undefined ? { externalUrl: externalUrl?.trim() || null } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return NextResponse.json(product);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const deleted = await prisma.product.deleteMany({
      where: { id, tenantId: ctx.tenant.id },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
