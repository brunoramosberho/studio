import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getTenantCurrency } from "@/lib/tenant";
import { buildPayrollLines, currentMonthPeriod, monthPeriod } from "@/lib/staff";
import { requireStaffManagement } from "../../_auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  try {
    const ctx = await requireStaffManagement();
    const { membershipId } = await params;

    const m = await prisma.membership.findFirst({
      where: { id: membershipId, tenantId: ctx.tenant.id },
      select: { userId: true },
    });
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    const month = url.searchParams.get("month");
    const period =
      year && month
        ? monthPeriod(parseInt(year, 10), parseInt(month, 10) - 1)
        : currentMonthPeriod();

    const currency = await getTenantCurrency();
    const lines = await buildPayrollLines({
      tenantId: ctx.tenant.id,
      period,
      userIds: [m.userId],
      tenantCurrency: currency.code,
    });

    // Include the underlying commission earnings for the detail view.
    const earnings = await prisma.staffCommissionEarning.findMany({
      where: {
        tenantId: ctx.tenant.id,
        userId: m.userId,
        occurredAt: { gte: period.from, lt: period.to },
      },
      include: {
        rule: {
          select: { id: true, sourceType: true, percentBps: true, flatAmountCents: true },
        },
        studio: { select: { id: true, name: true } },
        posTransaction: {
          select: { id: true, type: true, conceptSub: true, amount: true, currency: true },
        },
        stripePayment: {
          select: { id: true, type: true, conceptSub: true, amount: true, currency: true },
        },
      },
      orderBy: { occurredAt: "desc" },
    });

    return NextResponse.json({
      period: { from: period.from, to: period.to, label: period.label },
      line: lines[0] ?? null,
      earnings,
    });
  } catch (error) {
    console.error("GET membership payroll error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
