import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenantCurrency } from "@/lib/tenant";
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

    const rates = await prisma.staffPayRate.findMany({
      where: { tenantId: ctx.tenant.id, userId },
      include: { studio: { select: { id: true, name: true } } },
      orderBy: [{ isActive: "desc" }, { effectiveFrom: "desc" }],
    });
    return NextResponse.json(rates);
  } catch (error) {
    console.error("GET pay-rates error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

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
      studioId,
      hourlyRateCents,
      monthlyFixedCents,
      currency,
      effectiveFrom,
      effectiveTo,
      notes,
    } = body ?? {};

    if (
      (hourlyRateCents == null || hourlyRateCents <= 0) &&
      (monthlyFixedCents == null || monthlyFixedCents <= 0)
    ) {
      return NextResponse.json(
        { error: "Debes definir tarifa por hora o pago mensual fijo" },
        { status: 400 },
      );
    }

    // Validate studio belongs to tenant when provided.
    if (studioId) {
      const studio = await prisma.studio.findFirst({
        where: { id: studioId, tenantId: ctx.tenant.id },
        select: { id: true },
      });
      if (!studio) {
        return NextResponse.json({ error: "Estudio inválido" }, { status: 400 });
      }
    }

    const tenantCurrency = await getTenantCurrency();
    const rate = await prisma.staffPayRate.create({
      data: {
        tenantId: ctx.tenant.id,
        userId,
        studioId: studioId || null,
        hourlyRateCents: hourlyRateCents ? parseInt(String(hourlyRateCents), 10) : null,
        monthlyFixedCents: monthlyFixedCents ? parseInt(String(monthlyFixedCents), 10) : null,
        currency: currency || tenantCurrency.code,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        notes: notes || null,
      },
      include: { studio: { select: { id: true, name: true } } },
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    console.error("POST pay-rates error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
