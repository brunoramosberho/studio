import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { getReport } from "@/lib/reports/registry";

// Generic report runner: /api/admin/reports/<id>?from&to[&format=csv].
// The registry defines columns + query; this just executes and serializes.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const ctx = await requirePermission("analytics");
    const { reportId } = await params;

    const report = getReport(reportId);
    if (!report) {
      return NextResponse.json({ error: "Unknown report" }, { status: 404 });
    }

    const sp = req.nextUrl.searchParams;
    const now = new Date();
    const to = sp.get("to") ? new Date(`${sp.get("to")}T23:59:59.999Z`) : now;
    const from = sp.get("from")
      ? new Date(`${sp.get("from")}T00:00:00.000Z`)
      : new Date(now.getTime() - 29 * 86400_000);

    const rows = await report.run({ tenantId: ctx.tenant.id, from, to });

    if (sp.get("format") === "csv") {
      const esc = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = v instanceof Date ? v.toISOString() : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = report.columns.map((c) => esc(c.key)).join(",");
      const body = rows
        .map((r) => report.columns.map((c) => esc(r[c.key])).join(","))
        .join("\n");
      return new NextResponse(`﻿${header}\n${body}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${reportId}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      id: report.id,
      snapshot: report.snapshot ?? false,
      columns: report.columns,
      rows,
      rowCount: rows.length,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("GET /api/admin/reports/[reportId] error:", error);
    return NextResponse.json({ error: "Failed to run report" }, { status: 500 });
  }
}
