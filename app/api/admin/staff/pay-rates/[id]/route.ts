import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffManagement } from "../../_auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { id } = await params;

    const existing = await prisma.staffPayRate.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const allowed: Record<string, unknown> = {};
    if ("hourlyRateCents" in body) {
      allowed.hourlyRateCents =
        body.hourlyRateCents != null ? parseInt(String(body.hourlyRateCents), 10) : null;
    }
    if ("monthlyFixedCents" in body) {
      allowed.monthlyFixedCents =
        body.monthlyFixedCents != null ? parseInt(String(body.monthlyFixedCents), 10) : null;
    }
    if ("currency" in body) allowed.currency = String(body.currency);
    if ("studioId" in body) allowed.studioId = body.studioId || null;
    if ("effectiveFrom" in body)
      allowed.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
    if ("effectiveTo" in body)
      allowed.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
    if ("isActive" in body) allowed.isActive = Boolean(body.isActive);
    if ("notes" in body) allowed.notes = body.notes || null;

    const updated = await prisma.staffPayRate.update({
      where: { id },
      data: allowed,
      include: { studio: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH pay-rate error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { id } = await params;

    const existing = await prisma.staffPayRate.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.staffPayRate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE pay-rate error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
