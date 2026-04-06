import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const rates = await prisma.coachPayRate.findMany({
      where: { coachProfileId: id, tenantId: ctx.tenant.id },
      include: { classType: { select: { id: true, name: true, color: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(rates);
  } catch (error) {
    console.error("GET pay-rates error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const coach = await prisma.coachProfile.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!coach) {
      return NextResponse.json({ error: "Coach no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const { type, amount, currency, classTypeId, occupancyTiers, bonusMultiplier, bonusDays, bonusTags, effectiveFrom, effectiveTo, notes } = body;

    if (!type || amount == null) {
      return NextResponse.json({ error: "Tipo y monto son requeridos" }, { status: 400 });
    }

    const rate = await prisma.coachPayRate.create({
      data: {
        coachProfileId: id,
        tenantId: ctx.tenant.id,
        type,
        amount: parseFloat(amount),
        currency: currency || "MXN",
        classTypeId: classTypeId || null,
        occupancyTiers: occupancyTiers || null,
        bonusMultiplier: parseFloat(bonusMultiplier) || 1,
        bonusDays: bonusDays || null,
        bonusTags: bonusTags || [],
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        notes: notes || null,
      },
      include: { classType: { select: { id: true, name: true, color: true } } },
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    console.error("POST pay-rates error:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const body = await request.json();
    const { rateId, ...updates } = body;

    if (!rateId) {
      return NextResponse.json({ error: "rateId requerido" }, { status: 400 });
    }

    const existing = await prisma.coachPayRate.findFirst({
      where: { id: rateId, coachProfileId: id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Rate no encontrado" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (updates.amount != null) data.amount = parseFloat(updates.amount);
    if (updates.type) data.type = updates.type;
    if (updates.currency) data.currency = updates.currency;
    if (updates.classTypeId !== undefined) data.classTypeId = updates.classTypeId || null;
    if (updates.occupancyTiers !== undefined) data.occupancyTiers = updates.occupancyTiers;
    if (updates.bonusMultiplier != null) data.bonusMultiplier = parseFloat(updates.bonusMultiplier);
    if (updates.bonusDays !== undefined) data.bonusDays = updates.bonusDays;
    if (updates.bonusTags !== undefined) data.bonusTags = updates.bonusTags;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;
    if (updates.effectiveFrom) data.effectiveFrom = new Date(updates.effectiveFrom);
    if (updates.effectiveTo !== undefined) data.effectiveTo = updates.effectiveTo ? new Date(updates.effectiveTo) : null;
    if (updates.notes !== undefined) data.notes = updates.notes;

    const rate = await prisma.coachPayRate.update({
      where: { id: rateId },
      data,
      include: { classType: { select: { id: true, name: true, color: true } } },
    });

    return NextResponse.json(rate);
  } catch (error) {
    console.error("PUT pay-rates error:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { id } = await params;

    const { rateId } = await request.json();
    if (!rateId) {
      return NextResponse.json({ error: "rateId requerido" }, { status: 400 });
    }

    const existing = await prisma.coachPayRate.findFirst({
      where: { id: rateId, coachProfileId: id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Rate no encontrado" }, { status: 404 });
    }

    await prisma.coachPayRate.delete({ where: { id: rateId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE pay-rates error:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
