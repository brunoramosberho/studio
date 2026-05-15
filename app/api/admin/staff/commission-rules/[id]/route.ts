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

    const existing = await prisma.staffCommissionRule.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const allowed: Record<string, unknown> = {};
    if ("percentBps" in body) {
      const v = body.percentBps != null ? parseInt(String(body.percentBps), 10) : null;
      if (v != null && v > 10_000) {
        return NextResponse.json({ error: "percentBps inválido" }, { status: 400 });
      }
      allowed.percentBps = v;
    }
    if ("flatAmountCents" in body) {
      allowed.flatAmountCents =
        body.flatAmountCents != null ? parseInt(String(body.flatAmountCents), 10) : null;
    }
    if ("studioId" in body) allowed.studioId = body.studioId || null;
    if ("packageId" in body) allowed.packageId = body.packageId || null;
    if ("productId" in body) allowed.productId = body.productId || null;
    if ("sourceType" in body) allowed.sourceType = body.sourceType;
    if ("effectiveFrom" in body)
      allowed.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
    if ("effectiveTo" in body)
      allowed.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
    if ("isActive" in body) allowed.isActive = Boolean(body.isActive);
    if ("notes" in body) allowed.notes = body.notes || null;

    const updated = await prisma.staffCommissionRule.update({
      where: { id },
      data: allowed,
      include: {
        studio: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH commission-rule error:", error);
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

    const existing = await prisma.staffCommissionRule.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Soft-disable instead of hard delete — earnings reference it. Only hard
    // delete if there are no earnings tied to it.
    const earningsCount = await prisma.staffCommissionEarning.count({
      where: { ruleId: id },
    });
    if (earningsCount === 0) {
      await prisma.staffCommissionRule.delete({ where: { id } });
    } else {
      await prisma.staffCommissionRule.update({
        where: { id },
        data: { isActive: false, effectiveTo: new Date() },
      });
    }
    return NextResponse.json({ success: true, hardDeleted: earningsCount === 0 });
  } catch (error) {
    console.error("DELETE commission-rule error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
