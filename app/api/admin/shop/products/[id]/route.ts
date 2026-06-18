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
    const {
      name,
      description,
      price,
      currency,
      imageUrl,
      isVisible,
      isActive,
      externalUrl,
      categoryId,
      availableForPreOrder,
      studioIds,
    } = body;

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

    const studioIdsProvided = Array.isArray(studioIds);
    const validStudioIds = studioIdsProvided
      ? (
          await prisma.studio.findMany({
            where: {
              tenantId: ctx.tenant.id,
              id: {
                in: (studioIds as unknown[]).filter(
                  (x): x is string => typeof x === "string" && x.length > 0,
                ),
              },
            },
            select: { id: true },
          })
        ).map((s) => s.id)
      : [];

    const product = await prisma.$transaction(async (tx) => {
      if (studioIdsProvided) {
        await tx.productStudioAvailability.deleteMany({ where: { productId: id } });
        if (validStudioIds.length > 0) {
          await tx.productStudioAvailability.createMany({
            data: validStudioIds.map((studioId) => ({
              productId: id,
              studioId,
              tenantId: ctx.tenant.id,
            })),
            skipDuplicates: true,
          });
        }
      }
      return tx.product.update({
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
          ...(availableForPreOrder !== undefined
            ? { availableForPreOrder: availableForPreOrder === true }
            : {}),
        },
        include: {
          category: { select: { id: true, name: true } },
          studioAvailability: { select: { studioId: true } },
        },
      });
    });

    const { studioAvailability, ...rest } = product;
    return NextResponse.json({ ...rest, studioIds: studioAvailability.map((s) => s.studioId) });
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
