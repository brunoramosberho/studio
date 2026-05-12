import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, getTenantCurrency } from "@/lib/tenant";
import { addBusinessDays } from "@/lib/stripe/helpers";
import { escCsv } from "@/lib/csv";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type Range = "today" | "month" | "last30" | "last90" | "year";

function getDateRange(range: Range, month?: string) {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  switch (range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "month":
      if (month) {
        const [y, m] = month.split("-").map(Number);
        start = new Date(y, m - 1, 1);
        end = new Date(y, m, 0, 23, 59, 59, 999);
      } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      break;
    case "last30":
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
    case "last90":
      start = new Date(now);
      start.setDate(start.getDate() - 90);
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { start, end };
}

function getConceptType(type: string): string {
  if (type === "membership" || type === "subscription") return "Suscripción";
  if (type === "class" || type === "package") return "Bono / Paquete";
  if (type === "product") return "Producto";
  if (type === "penalty") return "Penalización";
  return "Otro";
}

function getMethodLabel(source: string): string {
  if (source === "stripe") return "Stripe";
  if (source === "tpv") return "TPV banco";
  if (source === "cash") return "Efectivo";
  if (source === "classpass") return "ClassPass";
  if (source === "wellhub") return "Wellhub";
  return source;
}

function getStatusLabel(status: string): string {
  if (status === "succeeded" || status === "completed") return "Cobrado";
  if (status === "failed") return "Fallido";
  if (status === "pending") return "Pendiente";
  if (status === "refunded") return "Reembolsado";
  return status;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;
    const tenant = ctx.tenant;
    const taxRate = tenant.taxRate ?? 0.21;

    const params = request.nextUrl.searchParams;
    const range = (params.get("range") ?? "month") as Range;
    const month = params.get("month") ?? undefined;

    const { start, end } = getDateRange(range, month);

    const [stripePayments, posTransactions] = await Promise.all([
      prisma.stripePayment.findMany({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
        },
        include: {
          member: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.posTransaction.findMany({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
        },
        include: {
          member: { select: { name: true, email: true } },
          processedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const hasTpvConfig = tenant.tpvFeePercent != null && tenant.tpvSettlementDays != null;

    interface CsvRow {
      date: string;
      client: string;
      email: string;
      concept: string;
      type: string;
      method: string;
      gross: number;
      fee: number | null;
      net: number | null;
      isEstimated: boolean;
      availableOn: string;
      base: number;
      iva: number;
      status: string;
      processedBy: string;
    }

    const rows: CsvRow[] = [];

    for (const sp of stripePayments) {
      const gross = sp.amount;
      const base = Math.round((gross / (1 + taxRate)) * 100) / 100;
      const iva = Math.round((gross - base) * 100) / 100;

      rows.push({
        date: format(sp.createdAt, "dd/MM/yyyy HH:mm", { locale: es }),
        client: sp.member?.name ?? "Sin nombre",
        email: sp.member?.email ?? "",
        concept: sp.concept ?? "",
        type: getConceptType(sp.type),
        method: "Stripe",
        gross,
        fee: sp.stripeFee ?? null,
        net: sp.netAmount ?? null,
        isEstimated: false,
        availableOn: sp.availableOn
          ? format(sp.availableOn, "dd/MM/yyyy", { locale: es })
          : "",
        base,
        iva,
        status: getStatusLabel(sp.status),
        processedBy: "Sistema",
      });
    }

    for (const pt of posTransactions) {
      const gross = pt.amount;
      const base = Math.round((gross / (1 + taxRate)) * 100) / 100;
      const iva = Math.round((gross - base) * 100) / 100;
      const source = pt.paymentMethod === "cash" ? "cash" : "tpv";

      let fee = pt.fee;
      let net = pt.netAmount;
      let availableOn = pt.availableOn
        ? format(pt.availableOn, "dd/MM/yyyy", { locale: es })
        : "";
      let isEstimated = pt.isFeesEstimated;

      if (source === "cash") {
        fee = null;
        net = gross;
        availableOn = "";
        isEstimated = false;
      } else if (fee == null && hasTpvConfig) {
        fee = gross * (tenant.tpvFeePercent! / 100) + (tenant.tpvFeeFixed ?? 0);
        fee = Math.round(fee * 100) / 100;
        net = Math.round((gross - fee) * 100) / 100;
        availableOn = format(
          addBusinessDays(pt.createdAt, tenant.tpvSettlementDays!),
          "dd/MM/yyyy",
          { locale: es },
        );
        isEstimated = true;
      }

      rows.push({
        date: format(pt.createdAt, "dd/MM/yyyy HH:mm", { locale: es }),
        client: pt.member?.name ?? "Sin nombre",
        email: pt.member?.email ?? "",
        concept: pt.concept ?? "",
        type: getConceptType(pt.type),
        method: getMethodLabel(source),
        gross,
        fee,
        net,
        isEstimated,
        availableOn,
        base,
        iva,
        status: getStatusLabel(pt.status === "completed" ? "succeeded" : pt.status),
        processedBy: pt.processedBy?.name ?? "Sistema",
      });
    }

    rows.sort((a, b) => {
      const da = a.date.split(" ")[0].split("/").reverse().join("");
      const db = b.date.split(" ")[0].split("/").reverse().join("");
      return db.localeCompare(da);
    });

    const tenantCurrency = await getTenantCurrency();
    const sym = tenantCurrency.symbol;
    const headers = [
      "Fecha",
      "Cliente",
      "Email",
      "Concepto",
      "Tipo",
      "Método de pago",
      `Monto bruto (${sym})`,
      `Fee (${sym})`,
      `Neto (${sym})`,
      "Es estimado",
      "Llega al banco",
      `Base imponible (${sym})`,
      `IVA (${sym})`,
      "Estado",
      "Cobrado por",
    ];

    const csvLines = [
      "\uFEFF" + headers.join(","),
      ...rows.map((r) =>
        [
          escCsv(r.date),
          escCsv(r.client),
          escCsv(r.email),
          escCsv(r.concept),
          escCsv(r.type),
          escCsv(r.method),
          r.gross.toFixed(2),
          r.fee != null ? r.fee.toFixed(2) : "",
          r.net != null ? r.net.toFixed(2) : "",
          r.isEstimated ? "TRUE" : "FALSE",
          escCsv(r.availableOn),
          r.base.toFixed(2),
          r.iva.toFixed(2),
          escCsv(r.status),
          escCsv(r.processedBy),
        ].join(","),
      ),
    ];

    const csv = csvLines.join("\n");
    const periodLabel = format(start, "MMMM-yyyy", { locale: es });
    const filename = `finanzas-${tenant.slug}-${periodLabel}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Forbidden") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[finance/export]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
