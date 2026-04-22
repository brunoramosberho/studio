import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { getMonthlyRevenueReport } from "@/lib/revenue/reports";

// GET /api/admin/finance/revenue-recognition?month=YYYY-MM
// Returns gross recognized revenue attributed to class/coach/time-slot +
// breakage, for the requesting tenant and month. Tenant is derived from the
// x-tenant-slug header via requireRole (no path param, matching the rest of
// the admin API surface).
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const monthParam = request.nextUrl.searchParams.get("month");
    const month = monthParam ?? defaultMonth(new Date());

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Invalid month, expected YYYY-MM" },
        { status: 400 },
      );
    }

    const report = await getMonthlyRevenueReport(tenantId, month);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized")
        return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Forbidden")
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[revenue-recognition]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function defaultMonth(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
