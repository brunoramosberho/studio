import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { getAnalytics } from "@/lib/analytics/server";
import type { Period } from "@/lib/analytics/types";

const VALID_PERIODS = new Set<Period>(["week", "month", "quarter"]);

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("analytics");
    const sp = request.nextUrl.searchParams;
    const periodParam = sp.get("period");
    const period: Period = VALID_PERIODS.has(periodParam as Period)
      ? (periodParam as Period)
      : "month";
    const disciplineId = sp.get("disciplineId") ?? undefined;

    const data = await getAnalytics(ctx.tenant.id, { period, disciplineId });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/analytics error:", error);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 },
    );
  }
}
