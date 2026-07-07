import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { getEstimatedEarnings } from "@/lib/revenue/estimated-earnings";
import { CSV_BOM, escCsv } from "@/lib/csv";

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// GET /api/admin/finance/revenue-recognition/export?month=YYYY-MM
// CSV with the same sections the page displays: summary, por paquete, por
// disciplina, por coach, por franja horaria. Amounts are in the tenant's
// currency, formatted as decimals (cents / 100).
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("finance");
    const tenantId = ctx.tenant.id;
    const slug = ctx.tenant.slug;

    const monthParam = request.nextUrl.searchParams.get("month");
    const month = monthParam ?? defaultMonth(new Date());

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "Invalid month, expected YYYY-MM" },
        { status: 400 },
      );
    }

    const report = await getEstimatedEarnings(tenantId, month);
    const currency = report.currency.toUpperCase();
    const fmt = (cents: number) => (cents / 100).toFixed(2);
    const KIND: Record<string, string> = {
      pack: "Paquete",
      subscription: "Suscripción",
      dropin: "Drop-in",
      platform: "Plataforma",
      other: "Otro",
    };

    const lines: string[] = [];

    lines.push(
      [escCsv("Ingresos estimados"), escCsv(month), escCsv(currency)].join(","),
    );
    lines.push(["Total estimado", fmt(report.summary.totalCents)].join(","));
    lines.push(
      ["Atribuido a clases", fmt(report.summary.attributedCents)].join(","),
    );
    lines.push(
      ["Breakage (suscripciones)", fmt(report.summary.breakageCents)].join(","),
    );
    lines.push(["Tope drop-in", fmt(report.dropInCapCents)].join(","));

    lines.push("");
    lines.push("Por fuente");
    lines.push(["Fuente", "Tipo", "Atribuciones", "Ingreso est.", "Breakage"].join(","));
    for (const row of report.byPackage) {
      lines.push(
        [
          escCsv(row.name),
          escCsv(KIND[row.kind] ?? row.kind),
          row.attributions,
          fmt(row.revenueCents),
          fmt(row.breakageCents),
        ].join(","),
      );
    }

    lines.push("");
    lines.push("Por disciplina");
    lines.push(["Disciplina", "Atribuciones", "Ingreso est."].join(","));
    for (const row of report.byDiscipline) {
      lines.push(
        [escCsv(row.disciplineName), row.attributions, fmt(row.revenueCents)].join(","),
      );
    }

    lines.push("");
    lines.push("Por coach");
    lines.push(["Coach", "Atribuciones", "Ingreso est."].join(","));
    for (const row of report.byCoach) {
      lines.push(
        [escCsv(row.coachName), row.attributions, fmt(row.revenueCents)].join(","),
      );
    }

    lines.push("");
    lines.push("Por franja horaria");
    lines.push(["Día", "Hora", "Atribuciones", "Ingreso est."].join(","));
    for (const row of report.byTimeslot) {
      lines.push(
        [
          escCsv(DOW_LABELS[row.dayOfWeek] ?? String(row.dayOfWeek)),
          `${row.hourOfDay}:00`,
          row.attributions,
          fmt(row.revenueCents),
        ].join(","),
      );
    }

    const csv = CSV_BOM + lines.join("\n");
    const filename = `ingresos-estimados-${slug}-${month}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized")
        return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Forbidden")
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[revenue-recognition/export]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function defaultMonth(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
