import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../../_auth";

async function resolveUserId(tenantId: string, membershipId: string) {
  const m = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      tenantId,
      role: { in: ["FRONT_DESK", "ADMIN"] },
    },
    select: { userId: true },
  });
  return m?.userId ?? null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { membershipId } = await params;
    const userId = await resolveUserId(ctx.tenant.id, membershipId);
    if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rules = await prisma.staffCommissionRule.findMany({
      where: { tenantId: ctx.tenant.id, userId },
      include: {
        studio: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json(rules);
  } catch (error) {
    console.error("GET commission-rules error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

const VALID_SOURCES = new Set([
  "POS_ANY",
  "PACKAGE",
  "PRODUCT",
  "SUBSCRIPTION",
  "PENALTY",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { membershipId } = await params;
    const userId = await resolveUserId(ctx.tenant.id, membershipId);
    if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const {
      sourceType,
      studioId,
      packageId,
      productId,
      percentBps,
      flatAmountCents,
      effectiveFrom,
      effectiveTo,
      notes,
    } = body ?? {};

    if (!sourceType || !VALID_SOURCES.has(String(sourceType))) {
      return NextResponse.json({ error: "sourceType inválido" }, { status: 400 });
    }
    if (
      (percentBps == null || percentBps <= 0) &&
      (flatAmountCents == null || flatAmountCents <= 0)
    ) {
      return NextResponse.json(
        { error: "Define un porcentaje o monto fijo" },
        { status: 400 },
      );
    }
    if (percentBps && percentBps > 10_000) {
      return NextResponse.json(
        { error: "percentBps no puede exceder 10000 (100%)" },
        { status: 400 },
      );
    }
    if (studioId) {
      const studio = await prisma.studio.findFirst({
        where: { id: studioId, tenantId: ctx.tenant.id },
        select: { id: true },
      });
      if (!studio) return NextResponse.json({ error: "Estudio inválido" }, { status: 400 });
    }
    if (packageId) {
      const pkg = await prisma.package.findFirst({
        where: { id: packageId, tenantId: ctx.tenant.id },
        select: { id: true },
      });
      if (!pkg) return NextResponse.json({ error: "Paquete inválido" }, { status: 400 });
    }
    if (productId) {
      const prod = await prisma.product.findFirst({
        where: { id: productId, tenantId: ctx.tenant.id },
        select: { id: true },
      });
      if (!prod) return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
    }

    const rule = await prisma.staffCommissionRule.create({
      data: {
        tenantId: ctx.tenant.id,
        userId,
        studioId: studioId || null,
        sourceType,
        packageId: packageId || null,
        productId: productId || null,
        percentBps: percentBps ? parseInt(String(percentBps), 10) : null,
        flatAmountCents: flatAmountCents ? parseInt(String(flatAmountCents), 10) : null,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        notes: notes || null,
      },
      include: {
        studio: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("POST commission-rules error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
