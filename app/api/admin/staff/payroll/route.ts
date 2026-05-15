import { NextRequest, NextResponse } from "next/server";
import { getTenantCurrency } from "@/lib/tenant";
import { buildPayrollLines, currentMonthPeriod, monthPeriod } from "@/lib/staff";
import { requireStaffManagement } from "../_auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireStaffManagement();

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
      tenantCurrency: currency.code,
    });

    const totals = lines.reduce(
      (acc, l) => ({
        hourlyTotalCents: acc.hourlyTotalCents + l.hourlyTotalCents,
        monthlyFixedCents: acc.monthlyFixedCents + l.monthlyFixedCents,
        commissionTotalCents: acc.commissionTotalCents + l.commissionTotalCents,
        totalCents: acc.totalCents + l.totalCents,
        totalHours: Number((acc.totalHours + l.totalHours).toFixed(2)),
      }),
      {
        hourlyTotalCents: 0,
        monthlyFixedCents: 0,
        commissionTotalCents: 0,
        totalCents: 0,
        totalHours: 0,
      },
    );

    return NextResponse.json({
      period: { from: period.from, to: period.to, label: period.label },
      currency: currency.code,
      lines,
      totals,
    });
  } catch (error) {
    console.error("GET payroll error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
