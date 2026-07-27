// Report engine: every report is a definition — id, category, columns, and a
// query that returns rows for a date range. The API runs them; the page and
// the CSV export are generic viewers. Adding a report = adding an entry here
// plus its i18n strings, nothing else.

import { prisma } from "@/lib/db";

export type ColumnType = "text" | "number" | "money" | "date" | "datetime" | "percent";

export interface ReportColumn {
  key: string;
  /** i18n key under admin.reportsPage.col */
  labelKey: string;
  type: ColumnType;
}

export type ReportCategory = "classes" | "memberships" | "sales" | "customers";

export interface ReportDef {
  id: string;
  category: ReportCategory;
  /** Snapshot reports ignore the date range (state "as of now"). */
  snapshot?: boolean;
  columns: ReportColumn[];
  run: (ctx: { tenantId: string; from: Date; to: Date }) => Promise<Record<string, unknown>[]>;
}

const MAX_ROWS = 2000;

const CONFIRMED_OR_ATTENDED = { in: ["CONFIRMED", "ATTENDED"] as ("CONFIRMED" | "ATTENDED")[] };

// ─── Classes ────────────────────────────────────────────

const classOccupancy: ReportDef = {
  id: "class-occupancy",
  category: "classes",
  columns: [
    { key: "date", labelKey: "date", type: "datetime" },
    { key: "className", labelKey: "class", type: "text" },
    { key: "coach", labelKey: "instructor", type: "text" },
    { key: "room", labelKey: "room", type: "text" },
    { key: "booked", labelKey: "bookings", type: "number" },
    { key: "capacity", labelKey: "capacity", type: "number" },
    { key: "occupancy", labelKey: "occupancy", type: "percent" },
  ],
  run: async ({ tenantId, from, to }) => {
    const now = new Date();
    const classes = await prisma.class.findMany({
      where: {
        tenantId,
        startsAt: { gte: from, lte: to },
        endsAt: { lte: now },
        status: { not: "CANCELLED" },
      },
      select: {
        startsAt: true,
        classType: { select: { name: true } },
        coach: { select: { name: true } },
        room: { select: { name: true, maxCapacity: true } },
        _count: { select: { bookings: { where: { status: CONFIRMED_OR_ATTENDED } } } },
      },
      orderBy: { startsAt: "desc" },
      take: MAX_ROWS,
    });
    return classes.map((c) => ({
      date: c.startsAt,
      className: c.classType.name,
      coach: c.coach.name,
      room: c.room?.name ?? "",
      booked: c._count.bookings,
      capacity: c.room?.maxCapacity ?? 0,
      occupancy: c.room?.maxCapacity
        ? Math.round((c._count.bookings / c.room.maxCapacity) * 100)
        : 0,
    }));
  },
};

const noShows: ReportDef = {
  id: "no-shows",
  category: "classes",
  columns: [
    { key: "date", labelKey: "classDate", type: "datetime" },
    { key: "member", labelKey: "member", type: "text" },
    { key: "email", labelKey: "email", type: "text" },
    { key: "className", labelKey: "class", type: "text" },
    { key: "coach", labelKey: "instructor", type: "text" },
  ],
  run: async ({ tenantId, from, to }) => {
    const rows = await prisma.booking.findMany({
      where: {
        tenantId,
        status: "NO_SHOW",
        class: { startsAt: { gte: from, lte: to } },
      },
      select: {
        guestName: true,
        user: { select: { name: true, email: true } },
        class: {
          select: {
            startsAt: true,
            classType: { select: { name: true } },
            coach: { select: { name: true } },
          },
        },
      },
      orderBy: { class: { startsAt: "desc" } },
      take: MAX_ROWS,
    });
    return rows.map((b) => ({
      date: b.class.startsAt,
      member: b.user?.name ?? b.guestName ?? "—",
      email: b.user?.email ?? "",
      className: b.class.classType.name,
      coach: b.class.coach.name,
    }));
  },
};

const lateCancels: ReportDef = {
  id: "late-cancels",
  category: "classes",
  columns: [
    { key: "classDate", labelKey: "classDate", type: "datetime" },
    { key: "member", labelKey: "member", type: "text" },
    { key: "className", labelKey: "class", type: "text" },
    { key: "cancelledAt", labelKey: "cancelledAt", type: "datetime" },
    { key: "cancelledBy", labelKey: "cancelledBy", type: "text" },
  ],
  run: async ({ tenantId, from, to }) => {
    const rows = await prisma.booking.findMany({
      where: {
        tenantId,
        status: "CANCELLED",
        class: { startsAt: { gte: from, lte: to } },
        OR: [{ creditLost: true }, { pendingPenalty: { is: { reason: "late_cancel" } } }],
      },
      select: {
        userId: true,
        guestName: true,
        cancelledAt: true,
        cancelledBy: true,
        user: { select: { name: true } },
        class: { select: { startsAt: true, classType: { select: { name: true } } } },
      },
      orderBy: { class: { startsAt: "desc" } },
      take: MAX_ROWS,
    });
    const cancellerIds = [
      ...new Set(
        rows
          .map((b) => b.cancelledBy)
          .filter((v): v is string => !!v && v !== "system")
          .filter((v, _, __) => !rows.some((b) => b.userId === v && b.cancelledBy === v)),
      ),
    ];
    const cancellers = cancellerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: cancellerIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(cancellers.map((c) => [c.id, c.name]));
    return rows.map((b) => ({
      classDate: b.class.startsAt,
      member: b.user?.name ?? b.guestName ?? "—",
      className: b.class.classType.name,
      cancelledAt: b.cancelledAt,
      cancelledBy:
        b.cancelledBy == null
          ? ""
          : b.cancelledBy === "system"
            ? "sistema"
            : b.cancelledBy === b.userId
              ? "socio"
              : (nameById.get(b.cancelledBy) ?? "staff"),
    }));
  },
};

// ─── Memberships ────────────────────────────────────────

const membershipSales: ReportDef = {
  id: "membership-sales",
  category: "memberships",
  columns: [
    { key: "date", labelKey: "date", type: "datetime" },
    { key: "member", labelKey: "member", type: "text" },
    { key: "email", labelKey: "email", type: "text" },
    { key: "packageName", labelKey: "package", type: "text" },
    { key: "type", labelKey: "type", type: "text" },
    { key: "price", labelKey: "price", type: "money" },
    { key: "status", labelKey: "status", type: "text" },
  ],
  run: async ({ tenantId, from, to }) => {
    const rows = await prisma.userPackage.findMany({
      where: {
        tenantId,
        purchasedAt: { gte: from, lte: to },
        status: { notIn: ["PENDING_PAYMENT"] },
      },
      select: {
        purchasedAt: true,
        status: true,
        user: { select: { name: true, email: true } },
        package: { select: { name: true, type: true, price: true } },
      },
      orderBy: { purchasedAt: "desc" },
      take: MAX_ROWS,
    });
    return rows.map((r) => ({
      date: r.purchasedAt,
      member: r.user.name ?? "—",
      email: r.user.email,
      packageName: r.package.name,
      type: r.package.type,
      price: r.package.price,
      status: r.status,
    }));
  },
};

const upcomingRenewals: ReportDef = {
  id: "upcoming-renewals",
  category: "memberships",
  columns: [
    { key: "member", labelKey: "member", type: "text" },
    { key: "email", labelKey: "email", type: "text" },
    { key: "plan", labelKey: "package", type: "text" },
    { key: "price", labelKey: "price", type: "money" },
    { key: "renewsAt", labelKey: "renewsAt", type: "date" },
    { key: "status", labelKey: "status", type: "text" },
  ],
  run: async ({ tenantId, from, to }) => {
    const rows = await prisma.memberSubscription.findMany({
      where: {
        tenantId,
        status: { in: ["active", "trialing", "past_due"] },
        currentPeriodEnd: { gte: from, lte: to },
      },
      select: {
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        cancelRequested: true,
        user: { select: { name: true, email: true } },
        package: { select: { name: true, price: true } },
      },
      orderBy: { currentPeriodEnd: "asc" },
      take: MAX_ROWS,
    });
    return rows.map((r) => ({
      member: r.user.name ?? "—",
      email: r.user.email,
      plan: r.package.name,
      price: r.package.price,
      renewsAt: r.currentPeriodEnd,
      status: r.cancelAtPeriodEnd || r.cancelRequested ? "cancela" : "renueva",
    }));
  },
};

const expirations: ReportDef = {
  id: "expirations",
  category: "memberships",
  columns: [
    { key: "member", labelKey: "member", type: "text" },
    { key: "email", labelKey: "email", type: "text" },
    { key: "packageName", labelKey: "package", type: "text" },
    { key: "creditsLeft", labelKey: "creditsLeft", type: "number" },
    { key: "expiresAt", labelKey: "expiresAt", type: "date" },
  ],
  run: async ({ tenantId, from, to }) => {
    const rows = await prisma.userPackage.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        expiresAt: { gte: from, lte: to },
        package: { type: { not: "SUBSCRIPTION" } },
      },
      select: {
        expiresAt: true,
        creditsTotal: true,
        creditsUsed: true,
        user: { select: { name: true, email: true } },
        package: { select: { name: true } },
      },
      orderBy: { expiresAt: "asc" },
      take: MAX_ROWS,
    });
    return rows.map((r) => ({
      member: r.user.name ?? "—",
      email: r.user.email,
      packageName: r.package.name,
      creditsLeft: r.creditsTotal == null ? null : Math.max(0, r.creditsTotal - r.creditsUsed),
      expiresAt: r.expiresAt,
    }));
  },
};

const outstandingCredits: ReportDef = {
  id: "outstanding-credits",
  category: "memberships",
  snapshot: true,
  columns: [
    { key: "member", labelKey: "member", type: "text" },
    { key: "email", labelKey: "email", type: "text" },
    { key: "packageName", labelKey: "package", type: "text" },
    { key: "creditsLeft", labelKey: "creditsLeft", type: "number" },
    { key: "expiresAt", labelKey: "expiresAt", type: "date" },
  ],
  run: async ({ tenantId }) => {
    const rows = await prisma.userPackage.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        expiresAt: { gte: new Date() },
        creditsTotal: { not: null },
        package: { type: { not: "SUBSCRIPTION" } },
      },
      select: {
        creditsTotal: true,
        creditsUsed: true,
        expiresAt: true,
        user: { select: { name: true, email: true } },
        package: { select: { name: true } },
      },
      orderBy: { expiresAt: "asc" },
      take: MAX_ROWS,
    });
    return rows
      .map((r) => ({
        member: r.user.name ?? "—",
        email: r.user.email,
        packageName: r.package.name,
        creditsLeft: Math.max(0, (r.creditsTotal ?? 0) - r.creditsUsed),
        expiresAt: r.expiresAt,
      }))
      .filter((r) => r.creditsLeft > 0);
  },
};

// ─── Sales ──────────────────────────────────────────────

const sales: ReportDef = {
  id: "sales",
  category: "sales",
  columns: [
    { key: "date", labelKey: "date", type: "datetime" },
    { key: "member", labelKey: "customer", type: "text" },
    { key: "concept", labelKey: "concept", type: "text" },
    { key: "type", labelKey: "type", type: "text" },
    { key: "method", labelKey: "method", type: "text" },
    { key: "amount", labelKey: "amount", type: "money" },
  ],
  run: async ({ tenantId, from, to }) => {
    const [stripe, pos] = await Promise.all([
      prisma.stripePayment.findMany({
        where: { tenantId, status: "succeeded", createdAt: { gte: from, lte: to } },
        select: {
          createdAt: true,
          amount: true,
          type: true,
          concept: true,
          member: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      }),
      prisma.posTransaction.findMany({
        where: { tenantId, status: "completed", createdAt: { gte: from, lte: to } },
        select: {
          createdAt: true,
          amount: true,
          type: true,
          concept: true,
          paymentMethod: true,
          member: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      }),
    ]);
    const rows = [
      ...stripe.map((p) => ({
        date: p.createdAt,
        member: p.member?.name ?? "—",
        concept: p.concept ?? p.type,
        type: p.type,
        method: "Stripe",
        amount: p.amount,
      })),
      ...pos.map((p) => ({
        date: p.createdAt,
        member: p.member?.name ?? "—",
        concept: p.concept ?? p.type,
        type: p.type,
        method: p.paymentMethod === "cash" ? "Efectivo" : "TPV",
        amount: p.amount,
      })),
    ];
    rows.sort((a, b) => b.date.getTime() - a.date.getTime());
    return rows.slice(0, MAX_ROWS);
  },
};

const productSales: ReportDef = {
  id: "product-sales",
  category: "sales",
  columns: [
    { key: "date", labelKey: "date", type: "datetime" },
    { key: "member", labelKey: "customer", type: "text" },
    { key: "concept", labelKey: "product", type: "text" },
    { key: "source", labelKey: "source", type: "text" },
    { key: "amount", labelKey: "amount", type: "money" },
  ],
  run: async ({ tenantId, from, to }) => {
    const [pos, barOrders] = await Promise.all([
      prisma.posTransaction.findMany({
        where: {
          tenantId,
          status: "completed",
          type: { in: ["product", "pos"] },
          createdAt: { gte: from, lte: to },
        },
        select: {
          createdAt: true,
          amount: true,
          concept: true,
          member: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      }),
      prisma.bookingProductOrder.findMany({
        where: {
          tenantId,
          status: { in: ["PAID", "READY", "PICKED_UP"] },
          paidAt: { gte: from, lte: to },
        },
        select: {
          paidAt: true,
          subtotalCents: true,
          user: { select: { name: true } },
          items: { select: { nameSnapshot: true, quantity: true } },
        },
        orderBy: { paidAt: "desc" },
        take: MAX_ROWS,
      }),
    ]);
    const rows = [
      ...pos.map((p) => ({
        date: p.createdAt,
        member: p.member?.name ?? "—",
        concept: p.concept ?? "Producto",
        source: "POS",
        amount: p.amount,
      })),
      ...barOrders.map((o) => ({
        date: o.paidAt ?? new Date(),
        member: o.user.name ?? "—",
        concept: o.items.map((i) => `${i.quantity}× ${i.nameSnapshot}`).join(", "),
        source: "Bar",
        amount: o.subtotalCents / 100,
      })),
    ];
    rows.sort((a, b) => b.date.getTime() - a.date.getTime());
    return rows.slice(0, MAX_ROWS);
  },
};

const refundsAndDebts: ReportDef = {
  id: "refunds-debts",
  category: "sales",
  columns: [
    { key: "date", labelKey: "date", type: "datetime" },
    { key: "member", labelKey: "customer", type: "text" },
    { key: "kind", labelKey: "type", type: "text" },
    { key: "concept", labelKey: "concept", type: "text" },
    { key: "amount", labelKey: "amount", type: "money" },
    { key: "status", labelKey: "status", type: "text" },
  ],
  run: async ({ tenantId, from, to }) => {
    const [failed, debts] = await Promise.all([
      prisma.stripePayment.findMany({
        where: {
          tenantId,
          status: { in: ["refunded", "failed", "disputed"] },
          createdAt: { gte: from, lte: to },
        },
        select: {
          createdAt: true,
          amount: true,
          status: true,
          concept: true,
          type: true,
          member: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      }),
      prisma.debt.findMany({
        where: { tenantId, createdAt: { gte: from, lte: to } },
        select: {
          createdAt: true,
          amount: true,
          status: true,
          notes: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      }),
    ]);
    const rows = [
      ...failed.map((p) => ({
        date: p.createdAt,
        member: p.member?.name ?? "—",
        kind: p.status === "refunded" ? "Reembolso" : p.status === "disputed" ? "Disputa" : "Pago fallido",
        concept: p.concept ?? p.type,
        amount: p.amount,
        status: p.status,
      })),
      ...debts.map((d) => ({
        date: d.createdAt,
        member: d.user?.name ?? "—",
        kind: "Deuda",
        concept: d.notes ?? "",
        amount: d.amount,
        status: d.status,
      })),
    ];
    rows.sort((a, b) => b.date.getTime() - a.date.getTime());
    return rows.slice(0, MAX_ROWS);
  },
};

// ─── Customers ──────────────────────────────────────────

const customerList: ReportDef = {
  id: "customer-list",
  category: "customers",
  snapshot: true,
  columns: [
    { key: "member", labelKey: "member", type: "text" },
    { key: "email", labelKey: "email", type: "text" },
    { key: "phone", labelKey: "phone", type: "text" },
    { key: "joined", labelKey: "joined", type: "date" },
    { key: "visits", labelKey: "visits", type: "number" },
    { key: "lastVisit", labelKey: "lastVisit", type: "date" },
    { key: "ltv", labelKey: "ltv", type: "money" },
  ],
  run: async ({ tenantId }) => {
    const members = await prisma.membership.findMany({
      where: { tenantId, role: "CLIENT" },
      select: {
        createdAt: true,
        userId: true,
        user: { select: { name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    const userIds = members.map((m) => m.userId);
    const [visitAgg, stripeAgg, posAgg, lastVisits] = await Promise.all([
      prisma.booking.groupBy({
        by: ["userId"],
        where: { tenantId, userId: { in: userIds }, status: "ATTENDED" },
        _count: true,
      }),
      prisma.stripePayment.groupBy({
        by: ["memberId"],
        where: { tenantId, memberId: { in: userIds }, status: "succeeded" },
        _sum: { amount: true },
      }),
      prisma.posTransaction.groupBy({
        by: ["memberId"],
        where: { tenantId, memberId: { in: userIds }, status: "completed" },
        _sum: { amount: true },
      }),
      prisma.booking.groupBy({
        by: ["userId"],
        where: { tenantId, userId: { in: userIds }, status: "ATTENDED" },
        _max: { createdAt: true },
      }),
    ]);
    const visits = new Map(visitAgg.map((v) => [v.userId, v._count]));
    const stripeLtv = new Map(stripeAgg.map((v) => [v.memberId, v._sum.amount ?? 0]));
    const posLtv = new Map(posAgg.map((v) => [v.memberId, v._sum.amount ?? 0]));
    const lastVisit = new Map(lastVisits.map((v) => [v.userId, v._max.createdAt]));
    return members.map((m) => ({
      member: m.user.name ?? "—",
      email: m.user.email,
      phone: m.user.phone ?? "",
      joined: m.createdAt,
      visits: visits.get(m.userId) ?? 0,
      lastVisit: lastVisit.get(m.userId) ?? null,
      ltv:
        Math.round(((stripeLtv.get(m.userId) ?? 0) + (posLtv.get(m.userId) ?? 0)) * 100) / 100,
    }));
  },
};

const newMembers: ReportDef = {
  id: "new-members",
  category: "customers",
  columns: [
    { key: "member", labelKey: "member", type: "text" },
    { key: "email", labelKey: "email", type: "text" },
    { key: "joined", labelKey: "joined", type: "date" },
    { key: "firstPurchase", labelKey: "firstPurchase", type: "date" },
  ],
  run: async ({ tenantId, from, to }) => {
    const rows = await prisma.membership.findMany({
      where: { tenantId, firstPurchaseAt: { gte: from, lte: to } },
      select: {
        createdAt: true,
        firstPurchaseAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { firstPurchaseAt: "desc" },
      take: MAX_ROWS,
    });
    return rows.map((m) => ({
      member: m.user.name ?? "—",
      email: m.user.email,
      joined: m.createdAt,
      firstPurchase: m.firstPurchaseAt,
    }));
  },
};

// ─── Registry ───────────────────────────────────────────

export const REPORTS: ReportDef[] = [
  classOccupancy,
  noShows,
  lateCancels,
  membershipSales,
  upcomingRenewals,
  expirations,
  outstandingCredits,
  sales,
  productSales,
  refundsAndDebts,
  customerList,
  newMembers,
];

export function getReport(id: string): ReportDef | undefined {
  return REPORTS.find((r) => r.id === id);
}
