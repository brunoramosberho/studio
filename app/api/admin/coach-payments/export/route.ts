import { NextRequest, NextResponse } from "next/server";
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

const LABELS = {
  es: {
    file: "pagos-instructores",
    summary: "Resumen",
    detail: "Detalle por clase",
    instructor: "Instructor",
    classes: "Clases",
    earned: "Impartido",
    projected: "Proyectado",
    fixed: "Sueldo fijo",
    total: "Total",
    date: "Fecha",
    discipline: "Disciplina",
    studio: "Estudio",
    room: "Sala",
    attendees: "Asistentes",
    capacity: "Cupo",
    occupancy: "Ocupación",
    rateType: "Tipo tarifa",
    rateDetail: "Detalle tarifa",
    bonus: "Bono",
    state: "Estado",
    amount: "Monto",
    taught: "Impartida",
    upcoming: "Próxima",
    PER_CLASS: "Por clase",
    PER_STUDENT: "Por alumno",
    OCCUPANCY_TIER: "Bono ocupación",
  },
  en: {
    file: "instructor-payments",
    summary: "Summary",
    detail: "Class detail",
    instructor: "Instructor",
    classes: "Classes",
    earned: "Earned",
    projected: "Projected",
    fixed: "Fixed salary",
    total: "Total",
    date: "Date",
    discipline: "Discipline",
    studio: "Studio",
    room: "Room",
    attendees: "Attendees",
    capacity: "Capacity",
    occupancy: "Occupancy",
    rateType: "Rate type",
    rateDetail: "Rate detail",
    bonus: "Bonus",
    state: "State",
    amount: "Amount",
    taught: "Taught",
    upcoming: "Upcoming",
    PER_CLASS: "Per class",
    PER_STUDENT: "Per student",
    OCCUPANCY_TIER: "Occupancy bonus",
  },
} as const;

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
    const L = sp.get("lang") === "en" ? LABELS.en : LABELS.es;
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
      const includeFixed = !studioFilter && !typeFilter && statusFilter !== "upcoming";
      if (lines.length === 0 && (!includeFixed || pay.monthlyFixed === 0)) continue;
      rows.push({ coach: coach.name, lines, monthlyFixed: includeFixed ? pay.monthlyFixed : 0 });
    }

    // Lazy-load exceljs (~22MB) so it's only pulled into this route's function
    // at request time, never into the shared server bundle (see next.config).
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Magic Studio";

    // ── Summary sheet ──
    const summary = wb.addWorksheet(L.summary);
    summary.columns = [
      { header: L.instructor, key: "coach", width: 26 },
      { header: L.classes, key: "classes", width: 10 },
      { header: L.earned, key: "earned", width: 14 },
      { header: L.projected, key: "projected", width: 14 },
      { header: L.fixed, key: "fixed", width: 14 },
      { header: `${L.total} (${currency})`, key: "total", width: 16 },
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
    const detail = wb.addWorksheet(L.detail);
    detail.columns = [
      { header: L.instructor, key: "coach", width: 24 },
      { header: L.date, key: "date", width: 18 },
      { header: L.discipline, key: "discipline", width: 18 },
      { header: L.studio, key: "studio", width: 18 },
      { header: L.room, key: "room", width: 14 },
      { header: L.attendees, key: "attendees", width: 11 },
      { header: L.capacity, key: "capacity", width: 8 },
      { header: L.occupancy, key: "occupancy", width: 11 },
      { header: L.rateType, key: "rateType", width: 14 },
      { header: L.rateDetail, key: "rateLabel", width: 22 },
      { header: L.bonus, key: "multiplier", width: 8 },
      { header: L.state, key: "state", width: 12 },
      { header: `${L.amount} (${currency})`, key: "amount", width: 14 },
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
          rateType: L[l.rateType] ?? l.rateType,
          rateLabel: l.rateLabel,
          multiplier: l.multiplier > 1 ? `×${l.multiplier}` : "—",
          state: l.isPast ? L.taught : L.upcoming,
          amount: l.amount,
        });
      }
    }
    detail.getRow(1).font = { bold: true };
    detail.getColumn("date").numFmt = "yyyy-mm-dd hh:mm";
    detail.getColumn("occupancy").numFmt = "0%";
    detail.getColumn("amount").numFmt = "#,##0.00";

    const buffer = await wb.xlsx.writeBuffer();
    const filename = `${L.file}-${label}.xlsx`;
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
