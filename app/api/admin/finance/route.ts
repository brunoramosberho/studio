import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

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

function getPreviousPeriodRange(start: Date, end: Date) {
  const duration = end.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - duration),
    end: new Date(start.getTime() - 1),
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;

    const params = request.nextUrl.searchParams;
    const range = (params.get("range") ?? "month") as Range;
    const month = params.get("month") ?? undefined;

    const { start, end } = getDateRange(range, month);
    const prev = getPreviousPeriodRange(start, end);
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const [
      stripePayments,
      prevStripePayments,
      posTransactions,
      prevPosTransactions,
      activeSubscriptions,
      newSubscriptions,
      failedStripePayments,
      upcomingSubscriptions,
    ] = await Promise.all([
      prisma.stripePayment.findMany({
        where: {
          tenantId,
          status: "succeeded",
          createdAt: { gte: start, lte: end },
        },
        select: { amount: true, type: true, createdAt: true, stripeFee: true, netAmount: true },
      }),
      prisma.stripePayment.findMany({
        where: {
          tenantId,
          status: "succeeded",
          createdAt: { gte: prev.start, lte: prev.end },
        },
        select: { amount: true },
      }),
      prisma.posTransaction.findMany({
        where: {
          tenantId,
          status: "completed",
          createdAt: { gte: start, lte: end },
        },
        select: { amount: true, type: true, paymentMethod: true, createdAt: true, fee: true, netAmount: true },
      }),
      prisma.posTransaction.findMany({
        where: {
          tenantId,
          status: "completed",
          createdAt: { gte: prev.start, lte: prev.end },
        },
        select: { amount: true },
      }),
      prisma.memberSubscription.findMany({
        where: { tenantId, status: "active" },
        include: { package: { select: { price: true, name: true } }, user: { select: { name: true } } },
      }),
      prisma.memberSubscription.count({
        where: {
          tenantId,
          status: "active",
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        },
      }),
      prisma.stripePayment.findMany({
        where: { tenantId, status: "failed" },
        include: { member: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.memberSubscription.findMany({
        where: {
          tenantId,
          status: "active",
          currentPeriodEnd: { gte: now, lte: sevenDaysFromNow },
        },
        include: {
          user: { select: { name: true } },
          package: { select: { name: true, price: true } },
        },
        orderBy: { currentPeriodEnd: "asc" },
      }),
    ]);

    const stripeGross = stripePayments.reduce((s, p) => s + p.amount, 0);
    const posGross = posTransactions.reduce((s, p) => s + p.amount, 0);
    const grossRevenue = stripeGross + posGross;

    const prevGross =
      prevStripePayments.reduce((s, p) => s + p.amount, 0) +
      prevPosTransactions.reduce((s, p) => s + p.amount, 0);

    const mrr = activeSubscriptions.reduce((s, sub) => s + sub.package.price, 0);

    const prevMrrStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMrrEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const prevMrrSubs = await prisma.memberSubscription.findMany({
      where: {
        tenantId,
        status: "active",
        createdAt: { lte: prevMrrEnd },
      },
      include: { package: { select: { price: true } } },
    });
    const prevMrr = prevMrrSubs
      .filter((s) => s.createdAt <= prevMrrEnd)
      .reduce((sum, s) => sum + s.package.price, 0);

    const failedPaymentsAmount = failedStripePayments.reduce((s, p) => s + p.amount, 0);
    const upcomingRenewalsAmount = upcomingSubscriptions.reduce(
      (s, sub) => s + sub.package.price,
      0,
    );

    // bySource breakdown
    const sourceMap: Record<string, number> = {
      subscriptions: 0,
      packages: 0,
      products: 0,
      penalties: 0,
      classpass: 0,
    };

    for (const p of stripePayments) {
      const t = p.type;
      if (t === "subscription" || t === "membership") sourceMap.subscriptions += p.amount;
      else if (t === "package" || t === "class") sourceMap.packages += p.amount;
      else if (t === "product") sourceMap.products += p.amount;
      else if (t === "penalty") sourceMap.penalties += p.amount;
      else sourceMap.packages += p.amount;
    }
    for (const p of posTransactions) {
      if (p.type === "subscription") sourceMap.subscriptions += p.amount;
      else if (p.type === "package") sourceMap.packages += p.amount;
      else if (p.type === "product") sourceMap.products += p.amount;
      else if (p.type === "penalty") sourceMap.penalties += p.amount;
    }

    const bySource = Object.entries(sourceMap).map(([source, amount]) => ({
      source,
      amount,
      percent: grossRevenue > 0 ? Math.round((amount / grossRevenue) * 100) : 0,
    }));

    // dailyRevenue
    const dailyMap = new Map<string, number>();
    const cursor = new Date(start);
    while (cursor <= end) {
      dailyMap.set(cursor.toISOString().slice(0, 10), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const p of stripePayments) {
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + p.amount);
    }
    for (const p of posTransactions) {
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + p.amount);
    }
    const dailyRevenue = Array.from(dailyMap.entries()).map(([date, amount]) => ({
      date,
      amount,
    }));

    // failedPayments
    const failedPayments = failedStripePayments.map((p) => ({
      memberId: p.member?.id ?? null,
      memberName: p.member?.name ?? "Sin nombre",
      memberEmail: p.member?.email ?? "",
      amount: p.amount,
      failedAt: p.createdAt.toISOString(),
    }));

    // upcomingRenewals grouped by day
    const renewalsByDay = new Map<
      string,
      { count: number; totalAmount: number; memberships: { memberName: string; membershipName: string; amount: number }[] }
    >();
    for (const sub of upcomingSubscriptions) {
      const dayKey = sub.currentPeriodEnd.toISOString().slice(0, 10);
      const entry = renewalsByDay.get(dayKey) ?? { count: 0, totalAmount: 0, memberships: [] };
      entry.count++;
      entry.totalAmount += sub.package.price;
      entry.memberships.push({
        memberName: sub.user.name ?? "Sin nombre",
        membershipName: sub.package.name,
        amount: sub.package.price,
      });
      renewalsByDay.set(dayKey, entry);
    }
    const upcomingRenewals = Array.from(renewalsByDay.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));

    const vsPreviousPeriod = {
      grossRevenue: prevGross > 0 ? Math.round(((grossRevenue - prevGross) / prevGross) * 100) : 0,
      mrr: prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100) : 0,
    };

    return NextResponse.json({
      summary: {
        grossRevenue,
        mrr,
        activeMemberships: activeSubscriptions.length,
        newMembershipsThisMonth: newSubscriptions,
        failedPaymentsAmount,
        failedPaymentsCount: failedStripePayments.length,
        upcomingRenewalsAmount,
        upcomingRenewalsCount: upcomingSubscriptions.length,
        vsPreviousPeriod,
      },
      bySource,
      dailyRevenue,
      failedPayments,
      upcomingRenewals,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Forbidden") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[finance]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
