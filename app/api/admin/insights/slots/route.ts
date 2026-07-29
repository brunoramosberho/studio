import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { buildSlotMatrix } from "@/lib/revenue/reports";

// Day×hour slot explorer for Insights: per-(weekday, hour, discipline, coach)
// aggregates the client filters and re-aggregates locally.
export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("analytics");
    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59.999Z`) : now;
    const from = sp.get("from")
      ? new Date(`${sp.get("from")}T00:00:00.000Z`)
      : new Date(now.getTime() - 29 * 86400_000);
    const matrix = await buildSlotMatrix(ctx.tenant.id, from, to);
    return NextResponse.json(matrix);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/admin/insights/slots error:", error);
    return NextResponse.json({ error: "Failed to load slot matrix" }, { status: 500 });
  }
}
