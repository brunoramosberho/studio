import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { getEstimatedEarnings } from "@/lib/revenue/estimated-earnings";

// GET /api/admin/finance/revenue-recognition?month=YYYY-MM
// Estimated earnings attributed per class/coach/discipline/package for the
// month: every attendance (packs, subscriptions, Wellhub) valued at up to the
// drop-in price, with subscription breakage. Tenant is derived from the
// x-tenant-slug header via requirePermission.
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("finance");
    const tenantId = ctx.tenant.id;

    const monthParam = request.nextUrl.searchParams.get("month");
    const month = monthParam ?? defaultMonth(new Date());

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Invalid month, expected YYYY-MM" },
        { status: 400 },
      );
    }

    const report = await getEstimatedEarnings(tenantId, month);
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
