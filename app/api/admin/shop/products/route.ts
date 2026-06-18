import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getTenantCurrency } from "@/lib/tenant";

async function filterTenantStudioIds(tenantId: string, ids: unknown[]): Promise<string[]> {
  const candidates = ids.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (candidates.length === 0) return [];
  const studios = await prisma.studio.findMany({
    where: { tenantId, id: { in: candidates } },
    select: { id: true },
  });
  return studios.map((s) => s.id);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const categoryId = request.nextUrl.searchParams.get("categoryId");

    const products = await prisma.product.findMany({
      where: {
        tenantId: ctx.tenant.id,
        ...(categoryId ? { categoryId } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        studioAvailability: { select: { studioId: true } },
      },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(
      products.map(({ studioAvailability, ...p }) => ({
        ...p,
        studioIds: studioAvailability.map((s) => s.studioId),
      })),
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const body = await request.json();
    const {
      name,
      description,
      price,
      currency,
      imageUrl,
      isVisible,
      externalUrl,
      categoryId,
      availableForPreOrder,
      studioIds,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }
    if (price == null || isNaN(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ error: "Precio inválido" }, { status: 400 });
    }
    if (!categoryId) {
      return NextResponse.json({ error: "Categoría requerida" }, { status: 400 });
    }

    const cat = await prisma.productCategory.findFirst({
      where: { id: categoryId, tenantId: ctx.tenant.id },
    });
    if (!cat) {
      return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    }

    const maxPos = await prisma.product.aggregate({
      where: { categoryId, tenantId: ctx.tenant.id },
      _max: { position: true },
    });

    const tenantCurrency = await getTenantCurrency();
    const validStudioIds = Array.isArray(studioIds)
      ? await filterTenantStudioIds(ctx.tenant.id, studioIds)
      : [];

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        price: Number(price),
        currency: currency || tenantCurrency.code,
        imageUrl: imageUrl || null,
        isVisible: isVisible ?? true,
        externalUrl: externalUrl?.trim() || null,
        availableForPreOrder: availableForPreOrder === true,
        position: (maxPos._max.position ?? -1) + 1,
        categoryId,
        tenantId: ctx.tenant.id,
        studioAvailability: validStudioIds.length
          ? {
              create: validStudioIds.map((studioId) => ({
                studioId,
                tenantId: ctx.tenant.id,
              })),
            }
          : undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        studioAvailability: { select: { studioId: true } },
      },
    });

    const { studioAvailability, ...rest } = product;
    return NextResponse.json(
      { ...rest, studioIds: studioAvailability.map((s) => s.studioId) },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
