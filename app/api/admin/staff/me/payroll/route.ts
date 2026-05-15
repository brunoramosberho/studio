import { NextRequest, NextResponse } from "next/server";
import { requireRole, getTenantCurrency } from "@/lib/tenant";
import { buildPayrollLines, currentMonthPeriod, monthPeriod } from "@/lib/staff";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("FRONT_DESK");
    const userId = ctx.session.user!.id!;

    const url = new URL(request.url);
    const year = url.searchParams.get("year");
    const month = url.searchParams.get("month");

    const period =
      year && month
        ? monthPeriod(parseInt(year, 10), parseInt(month, 10) - 1)
        : currentMonthPeriod();

    const tenantCurrency = await getTenantCurrency();
    const lines = await buildPayrollLines({
      tenantId: ctx.tenant.id,
      period,
      userIds: [userId],
      tenantCurrency: tenantCurrency.code,
    });

    return NextResponse.json({
      period: { from: period.from, to: period.to, label: period.label },
      line: lines[0] ?? null,
    });
  } catch (error) {
    console.error("GET /api/admin/staff/me/payroll error:", error);
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
