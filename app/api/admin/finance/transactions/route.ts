import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { addBusinessDays } from "@/lib/stripe/helpers";

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
  if (type === "subscription") return "subscription";
  if (type === "membership" || type === "class" || type === "package") return "package";
  if (type === "product" || type === "pos") return "product";
  if (type === "penalty") return "penalty";
  return "package";
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;
    const tenant = ctx.tenant;

    const params = request.nextUrl.searchParams;
    const range = (params.get("range") ?? "month") as Range;
    const month = params.get("month") ?? undefined;
    const method = params.get("method") ?? "all";
    const search = params.get("search") ?? "";
    const page = Math.max(1, parseInt(params.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") ?? "25", 10)));

    const { start, end } = getDateRange(range, month);

    const stripeWhere: Record<string, unknown> = {
      tenantId,
      createdAt: { gte: start, lte: end },
    };
    const posWhere: Record<string, unknown> = {
      tenantId,
      createdAt: { gte: start, lte: end },
    };

    if (method === "failed") {
      stripeWhere.status = "failed";
    } else if (method !== "all") {
      if (method === "stripe") {
        posWhere.id = "NONE";
      } else if (method === "tpv") {
        stripeWhere.id = "NONE";
        posWhere.paymentMethod = "card";
      } else if (method === "cash") {
        stripeWhere.id = "NONE";
        posWhere.paymentMethod = "cash";
      }
    }

    const [stripePayments, posTransactions] = await Promise.all([
      prisma.stripePayment.findMany({
        where: stripeWhere,
        include: {
          member: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.posTransaction.findMany({
        where: posWhere,
        include: {
          member: { select: { id: true, name: true, email: true } },
          processedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Resolve referenceIds to actual item names
    const allRefIds = [
      ...stripePayments.filter((p) => p.referenceId).map((p) => p.referenceId!),
      ...posTransactions.filter((p) => p.referenceId).map((p) => p.referenceId!),
    ];
    const uniqueRefIds = [...new Set(allRefIds)];

    const userPackages = uniqueRefIds.length > 0
      ? await prisma.userPackage.findMany({
          where: { id: { in: uniqueRefIds } },
          include: { package: { select: { id: true, name: true, type: true, price: true, currency: true } } },
        })
      : [];

    const products = uniqueRefIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: uniqueRefIds } },
          select: { id: true, name: true, price: true },
        })
      : [];

    const refMap = new Map<string, { name: string; itemType: string; itemId: string; href: string | null }>();
    for (const up of userPackages) {
      const pkgType = up.package.type;
      const href = pkgType === "SUBSCRIPTION" ? "/admin/subscriptions" : "/admin/packages";
      refMap.set(up.id, { name: up.package.name, itemType: pkgType, itemId: up.package.id, href });
    }
    for (const p of products) {
      refMap.set(p.id, { name: p.name, itemType: "PRODUCT", itemId: p.id, href: "/admin/shop" });
    }

    interface UnifiedTransaction {
      id: string;
      source: string;
      memberId: string | null;
      memberName: string;
      memberEmail: string;
      concept: string | null;
      conceptSub: string | null;
      conceptType: string;
      itemName: string | null;
      itemHref: string | null;
      grossAmount: number;
      fee: number | null;
      netAmount: number | null;
      availableOn: string | null;
      isFeesEstimated: boolean;
      status: string;
      processedBy: { id: string; name: string; initials: string; avatarColor: string } | null;
      processedByType: string;
      createdAt: string;
    }

    const unified: UnifiedTransaction[] = [];

    for (const sp of stripePayments) {
      const ref = sp.referenceId ? refMap.get(sp.referenceId) : null;
      const resolvedType = ref
        ? (ref.itemType === "SUBSCRIPTION" ? "subscription"
          : ref.itemType === "PRODUCT" ? "product"
          : "package")
        : getConceptType(sp.type);
      const defaultConceptSub =
        resolvedType === "subscription" ? "Renovación automática" :
        resolvedType === "package" ? "Compra de paquete" :
        resolvedType === "product" ? "Compra en tienda" :
        resolvedType === "penalty" ? "Penalización" :
        "Pago con Stripe";
      unified.push({
        id: sp.id,
        source: "stripe",
        memberId: sp.member?.id ?? null,
        memberName: sp.member?.name ?? "Sin nombre",
        memberEmail: sp.member?.email ?? "",
        concept: sp.concept ?? ref?.name ?? null,
        conceptSub: sp.conceptSub ?? defaultConceptSub,
        conceptType: resolvedType,
        itemName: ref?.name ?? null,
        itemHref: ref?.href ?? null,
        grossAmount: sp.amount,
        fee: sp.stripeFee ?? null,
        netAmount: sp.netAmount ?? null,
        availableOn: sp.availableOn?.toISOString() ?? null,
        isFeesEstimated: false,
        status: sp.status,
        processedBy: null,
        processedByType: "system",
        createdAt: sp.createdAt.toISOString(),
      });
    }

    const hasTpvConfig = tenant.tpvFeePercent != null && tenant.tpvSettlementDays != null;

    for (const pt of posTransactions) {
      const source = pt.paymentMethod === "cash" ? "cash" : "tpv";
      const initials = pt.processedBy?.name
        ? pt.processedBy.name
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
        : "";

      let fee = pt.fee;
      let netAmount = pt.netAmount;
      let availableOn = pt.availableOn?.toISOString() ?? null;
      let isFeesEstimated = pt.isFeesEstimated;

      if (source === "cash") {
        fee = null;
        netAmount = pt.amount;
        availableOn = null;
        isFeesEstimated = false;
      } else if (fee == null && hasTpvConfig) {
        fee = pt.amount * (tenant.tpvFeePercent! / 100) + (tenant.tpvFeeFixed ?? 0);
        fee = Math.round(fee * 100) / 100;
        netAmount = Math.round((pt.amount - fee) * 100) / 100;
        availableOn = addBusinessDays(pt.createdAt, tenant.tpvSettlementDays!).toISOString();
        isFeesEstimated = true;
      }

      const posRef = pt.referenceId ? refMap.get(pt.referenceId) : null;
      const posResolvedType = posRef
        ? (posRef.itemType === "SUBSCRIPTION" ? "subscription"
          : posRef.itemType === "PRODUCT" ? "product"
          : "package")
        : getConceptType(pt.type);
      const posDefaultSub =
        posResolvedType === "subscription" ? "Cobro en recepción" :
        posResolvedType === "package" ? "Venta de paquete · POS" :
        posResolvedType === "product" ? "Venta en tienda · POS" :
        posResolvedType === "penalty" ? "Penalización · POS" :
        source === "cash" ? "Pago en efectivo" : "POS · Front desk";
      unified.push({
        id: pt.id,
        source,
        memberId: pt.member?.id ?? null,
        memberName: pt.member?.name ?? "Sin nombre",
        memberEmail: pt.member?.email ?? "",
        concept: pt.concept ?? posRef?.name ?? null,
        conceptSub: pt.conceptSub ?? posDefaultSub,
        conceptType: posResolvedType,
        itemName: posRef?.name ?? null,
        itemHref: posRef?.href ?? null,
        grossAmount: pt.amount,
        fee,
        netAmount,
        availableOn,
        isFeesEstimated,
        status: pt.status === "completed" ? "succeeded" : pt.status,
        processedBy: pt.processedBy
          ? {
              id: pt.processedBy.id,
              name: pt.processedBy.name ?? "",
              initials,
              avatarColor: "#1A2C4E",
            }
          : null,
        processedByType: pt.processedBy ? "staff" : "system",
        createdAt: pt.createdAt.toISOString(),
      });
    }

    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let filtered = unified;
    if (search) {
      const q = search.toLowerCase();
      filtered = unified.filter(
        (t) =>
          t.memberName.toLowerCase().includes(q) ||
          t.memberEmail.toLowerCase().includes(q) ||
          t.source.toLowerCase().includes(q) ||
          (t.concept ?? "").toLowerCase().includes(q) ||
          t.grossAmount.toString().includes(q),
      );
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const transactions = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      transactions,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Forbidden") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[finance/transactions]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
