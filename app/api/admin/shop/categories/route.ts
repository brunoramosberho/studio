import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN");
    const categories = await prisma.productCategory.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { _count: { select: { products: true } } },
      orderBy: { position: "asc" },
    });
    return NextResponse.json(categories);
  } catch (e: unknown) {
    console.error("GET /api/admin/shop/categories error:", e);
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const { name } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }

    const maxPos = await prisma.productCategory.aggregate({
      where: { tenantId: ctx.tenant.id },
      _max: { position: true },
    });

    const category = await prisma.productCategory.create({
      data: {
        name: name.trim(),
        position: (maxPos._max.position ?? -1) + 1,
        tenantId: ctx.tenant.id,
      },
      include: { _count: { select: { products: true } } },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (e: unknown) {
    console.error("POST /api/admin/shop/categories error:", e);
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
