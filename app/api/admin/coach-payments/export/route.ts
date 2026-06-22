import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { requirePermission, getTenantCurrency } from "@/lib/tenant";
import { computeCoachPay, type CoachPayClassLine } from "@/lib/coach/pay";

function monthRange(month: string | null): { from: Date; to: Date; label: string } {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth();
  if (month) {
    const [yy, mm] = month.split("-").map(Number);
    if (Number.isFinite(yy) && Number.isFinite(mm)) {
      y = yy;
      m = mm - 1;
    }
  }
  return {
    from: new Date(y, m, 1, 0, 0, 0, 0),
    to: new Date(y, m + 1, 0, 23, 59, 59, 999),
    label: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

const RATE_LABELS: Record<string, string> = {
  PER_CLASS: "Por clase",
  PER_STUDENT: "Por alumno",
  OCCUPANCY_TIER: "Bono ocupación",
  MONTHLY_FIXED: "Sueldo fijo",
};

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("staffManagement");
    const tenantId = ctx.tenant.id;
    const sp = request.nextUrl.searchParams;

    const { from, to, label } = monthRange(sp.get("month"));
    const coachIdParam = sp.get("coachId");
    const studioFilter = sp.get("studioId");
    const typeFilter = sp.get("classTypeId");
    const statusFilter = sp.get("status"); // "past" | "upcoming" | null(all)
    const currency = (await getTenantCurrency()).code;

    const coaches = await prisma.coachProfile.findMany({
      where: { tenantId, ...(coachIdParam ? { id: coachIdParam } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const matchLine = (l: CoachPayClassLine) =>
      (!studioFilter || l.studioId === studioFilter) &&
      (!typeFilter || l.classTypeId === typeFilter) &&
      (statusFilter === "past" ? l.isPast : statusFilter === "upcoming" ? !l.isPast : true);

    const rows: Array<{ coach: string; lines: CoachPayClassLine[]; monthlyFixed: number }> = [];
    for (const coach of coaches) {
      const pay = await computeCoachPay(coach.id, tenantId, from, to, currency);
      const lines = pay.classLines.filter(matchLine);
      // Monthly fixed only makes sense unfiltered by studio/type/status.
      const includeFixed = !studioFilter && !typeFilter && statusFilter !== "upcoming";
      if (lines.length === 0 && (!includeFixed || pay.monthlyFixed === 0)) continue;
      rows.push({ coach: coach.name, lines, monthlyFixed: includeFixed ? pay.monthlyFixed : 0 });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Magic Studio";

    // ── Summary sheet ──
    const summary = wb.addWorksheet("Resumen");
    summary.columns = [
      { header: "Coach", key: "coach", width: 26 },
      { header: "Clases", key: "classes", width: 10 },
      { header: "Impartido", key: "earned", width: 14 },
      { header: "Proyectado", key: "projected", width: 14 },
      { header: "Sueldo fijo", key: "fixed", width: 14 },
      { header: `Total (${currency})`, key: "total", width: 16 },
    ];
    for (const r of rows) {
      const earned = r.lines.filter((l) => l.isPast).reduce((s, l) => s + l.amount, 0);
      const projected = r.lines.filter((l) => !l.isPast).reduce((s, l) => s + l.amount, 0);
      summary.addRow({
        coach: r.coach,
        classes: r.lines.length,
        earned: Math.round(earned * 100) / 100,
        projected: Math.round(projected * 100) / 100,
        fixed: r.monthlyFixed,
        total: Math.round((earned + projected + r.monthlyFixed) * 100) / 100,
      });
    }
    summary.getRow(1).font = { bold: true };
    ["earned", "projected", "fixed", "total"].forEach((k) => {
      summary.getColumn(k).numFmt = "#,##0.00";
    });

    // ── Detail sheet ──
    const detail = wb.addWorksheet("Detalle por clase");
    detail.columns = [
      { header: "Coach", key: "coach", width: 24 },
      { header: "Fecha", key: "date", width: 18 },
      { header: "Disciplina", key: "discipline", width: 18 },
      { header: "Estudio", key: "studio", width: 18 },
      { header: "Sala", key: "room", width: 14 },
      { header: "Asistentes", key: "attendees", width: 11 },
      { header: "Cupo", key: "capacity", width: 8 },
      { header: "Ocupación", key: "occupancy", width: 11 },
      { header: "Tipo tarifa", key: "rateType", width: 14 },
      { header: "Detalle tarifa", key: "rateLabel", width: 22 },
      { header: "Bono", key: "multiplier", width: 8 },
      { header: "Estado", key: "state", width: 12 },
      { header: `Monto (${currency})`, key: "amount", width: 14 },
    ];
    for (const r of rows) {
      for (const l of r.lines) {
        detail.addRow({
          coach: r.coach,
          date: new Date(l.startsAt),
          discipline: l.classTypeName,
          studio: l.studioName,
          room: l.roomName,
          attendees: l.attendees,
          capacity: l.capacity,
          occupancy: l.occupancyPct / 100,
          rateType: RATE_LABELS[l.rateType] ?? l.rateType,
          rateLabel: l.rateLabel,
          multiplier: l.multiplier > 1 ? `×${l.multiplier}` : "—",
          state: l.isPast ? "Impartida" : "Próxima",
          amount: l.amount,
        });
      }
    }
    detail.getRow(1).font = { bold: true };
    detail.getColumn("date").numFmt = "yyyy-mm-dd hh:mm";
    detail.getColumn("occupancy").numFmt = "0%";
    detail.getColumn("amount").numFmt = "#,##0.00";

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `pagos-coaches-${label}.xlsx`;
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/coach-payments/export error:", error);
    return NextResponse.json({ error: "Failed to export" }, { status: 500 });
  }
}
