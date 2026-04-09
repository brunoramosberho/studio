import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";


function getMethodLabel(source: string): string {
  if (source === "stripe") return "Stripe";
  if (source === "tpv") return "TPV";
  if (source === "cash") return "Efectivo";
  return source;
}

function resolveTypeLabel(paymentType: string, ref: { itemType?: string } | null): string {
  if (ref?.itemType === "SUBSCRIPTION") return "Suscripción";
  if (ref?.itemType === "PACK" || ref?.itemType === "OFFER") return "Bono / Paquete";
  if (ref?.itemType === "PRODUCT") return "Producto";
  if (paymentType === "subscription") return "Suscripción";
  if (paymentType === "membership" || paymentType === "class" || paymentType === "package") return "Bono / Paquete";
  if (paymentType === "product" || paymentType === "pos") return "Producto";
  if (paymentType === "penalty") return "Penalización";
  return "Otro";
}

function buildPaymentHistory(
  stripePayments: { id: string; amount: number; status: string; type: string; referenceId: string | null; concept: string | null; createdAt: Date }[],
  posTransactions: { id: string; amount: number; status: string; type: string; referenceId: string | null; paymentMethod: string; concept: string | null; processedBy: { name: string | null } | null; createdAt: Date }[],
  refMap: Map<string, { name: string; href: string | null; itemType?: string }>,
) {
  const payments: {
    id: string;
    amount: number;
    method: string;
    type: string;
    typeLabel: string;
    concept: string | null;
    itemName: string | null;
    itemHref: string | null;
    status: string;
    processedBy: string;
    createdAt: string;
  }[] = [];

  for (const sp of stripePayments) {
    const ref = sp.referenceId ? refMap.get(sp.referenceId) : null;
    payments.push({
      id: sp.id,
      amount: sp.amount,
      method: "Stripe",
      type: sp.type,
      typeLabel: resolveTypeLabel(sp.type, ref ?? null),
      concept: sp.concept ?? ref?.name ?? null,
      itemName: ref?.name ?? null,
      itemHref: ref?.href ?? null,
      status: sp.status,
      processedBy: "Sistema",
      createdAt: sp.createdAt.toISOString(),
    });
  }

  for (const pt of posTransactions) {
    const ref = pt.referenceId ? refMap.get(pt.referenceId) : null;
    payments.push({
      id: pt.id,
      amount: pt.amount,
      method: getMethodLabel(pt.paymentMethod === "cash" ? "cash" : "tpv"),
      type: pt.type,
      typeLabel: resolveTypeLabel(pt.type, ref ?? null),
      concept: pt.concept ?? ref?.name ?? null,
      itemName: ref?.name ?? null,
      itemHref: ref?.href ?? null,
      status: pt.status === "completed" ? "succeeded" : pt.status,
      processedBy: pt.processedBy?.name ?? "Sistema",
      createdAt: pt.createdAt.toISOString(),
    });
  }

  payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return payments;
}

function buildRevenueSummary(
  stripePayments: { amount: number; status: string; type: string; referenceId: string | null; createdAt: Date }[],
  posTransactions: { amount: number; status: string; type: string; referenceId: string | null; createdAt: Date }[],
  refMap: Map<string, { name: string; href: string | null; itemType?: string }>,
  yearStart: Date,
  monthStart: Date,
) {
  let totalHistoric = 0;
  let totalThisYear = 0;
  let totalThisMonth = 0;
  let countTotal = 0;
  let countThisYear = 0;
  const byType: Record<string, number> = {};

  const allPayments = [
    ...stripePayments.filter((p) => p.status === "succeeded").map((p) => ({ amount: p.amount, type: p.type, referenceId: p.referenceId, createdAt: p.createdAt })),
    ...posTransactions.filter((p) => p.status === "completed").map((p) => ({ amount: p.amount, type: p.type, referenceId: p.referenceId, createdAt: p.createdAt })),
  ];

  for (const p of allPayments) {
    totalHistoric += p.amount;
    countTotal++;

    const ref = p.referenceId ? refMap.get(p.referenceId) : null;
    const label = resolveTypeLabel(p.type, ref ?? null);
    byType[label] = (byType[label] ?? 0) + p.amount;

    if (p.createdAt >= yearStart) {
      totalThisYear += p.amount;
      countThisYear++;
    }
    if (p.createdAt >= monthStart) {
      totalThisMonth += p.amount;
    }
  }

  return {
    totalHistoric,
    totalThisYear,
    totalThisMonth,
    transactionsCount: countTotal,
    transactionsThisYear: countThisYear,
    byType: Object.entries(byType).map(([type, amount]) => ({ type, amount })),
  };
}

async function resolveRefMap(
  stripePayments: { referenceId: string | null }[],
  posTransactions: { referenceId: string | null }[],
) {
  const allRefIds = [
    ...stripePayments.filter((p) => p.referenceId).map((p) => p.referenceId!),
    ...posTransactions.filter((p) => p.referenceId).map((p) => p.referenceId!),
  ];
  const uniqueRefIds = [...new Set(allRefIds)];

  const refMap = new Map<string, { name: string; href: string | null; itemType?: string }>();

  if (uniqueRefIds.length > 0) {
    const [userPkgs, prods] = await Promise.all([
      prisma.userPackage.findMany({
        where: { id: { in: uniqueRefIds } },
        include: { package: { select: { id: true, name: true, type: true } } },
      }),
      prisma.product.findMany({
        where: { id: { in: uniqueRefIds } },
        select: { id: true, name: true },
      }),
    ]);
    for (const up of userPkgs) {
      const href = up.package.type === "SUBSCRIPTION" ? "/admin/subscriptions" : "/admin/packages";
      refMap.set(up.id, { name: up.package.name, href, itemType: up.package.type });
    }
    for (const p of prods) {
      refMap.set(p.id, { name: p.name, href: "/admin/shop", itemType: "PRODUCT" });
    }
  }

  return refMap;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const tenantId = ctx.tenant.id;
    const { id: userId } = await params;

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { role: true, pwaInstalledAt: true, lastSeenAt: true, createdAt: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [user, progress, achievements, allAchievements, packages, levels, memberSubscriptions] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            phone: true,
            birthday: true,
            instagramUser: true,
            stravaUser: true,
            createdAt: true,
          },
        }),

        prisma.memberProgress.findUnique({
          where: { userId_tenantId: { userId, tenantId } },
          include: { currentLevel: true },
        }),

        prisma.memberAchievement.findMany({
          where: { userId, tenantId },
          include: { achievement: true },
          orderBy: { earnedAt: "desc" },
        }),

        prisma.achievement.findMany({
          where: { active: true, OR: [{ tenantId: null }, { tenantId }] },
          orderBy: { createdAt: "asc" },
        }),

        prisma.userPackage.findMany({
          where: { userId, tenantId },
          include: { package: { select: { name: true, type: true } } },
          orderBy: { expiresAt: "desc" },
        }),

        prisma.loyaltyLevel.findMany({ orderBy: { minClasses: "asc" } }),

        prisma.memberSubscription.findMany({
          where: { userId, tenantId },
          include: {
            package: {
              select: { id: true, name: true, price: true, currency: true, recurringInterval: true },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const yearStart = new Date(now.getFullYear(), 0, 1);

    const [
      upcomingBookings,
      pastBookings,
      totalBookings,
      classesThisMonth,
      stripePayments,
      posTransactions,
    ] = await Promise.all([
        prisma.booking.findMany({
          where: {
            userId,
            status: { in: ["CONFIRMED", "ATTENDED"] },
            class: { tenantId, startsAt: { gte: now } },
          },
          include: {
            class: {
              include: {
                classType: { select: { name: true, color: true } },
                coach: { select: { name: true, user: { select: { name: true } } } },
                room: { select: { name: true } },
              },
            },
          },
          orderBy: { class: { startsAt: "asc" } },
          take: 10,
        }),

        prisma.booking.findMany({
          where: {
            userId,
            class: { tenantId, startsAt: { lt: now } },
          },
          include: {
            class: {
              include: {
                classType: { select: { name: true, color: true } },
                coach: { select: { name: true, user: { select: { name: true } } } },
              },
            },
          },
          orderBy: { class: { startsAt: "desc" } },
          take: 30,
        }),

        prisma.booking.count({
          where: {
            userId,
            status: "ATTENDED",
            class: { tenantId },
          },
        }),

        prisma.booking.count({
          where: {
            userId,
            status: "ATTENDED",
            class: { tenantId, startsAt: { gte: monthStart } },
          },
        }),

        prisma.stripePayment.findMany({
          where: { tenantId, memberId: userId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),

        prisma.posTransaction.findMany({
          where: { tenantId, memberId: userId },
          include: { processedBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

    const earnedIds = new Set(achievements.map((a) => a.achievementId));

    const currentLevel = progress?.currentLevel ?? levels[0] ?? null;
    const nextLevel = currentLevel
      ? levels.find((l) => l.minClasses > currentLevel.minClasses) ?? null
      : levels[1] ?? null;
    const totalClasses = progress?.totalClassesAttended ?? 0;
    const classesToNext = nextLevel
      ? Math.max(0, nextLevel.minClasses - totalClasses)
      : 0;
    const progressPercent =
      currentLevel && nextLevel && nextLevel.minClasses > currentLevel.minClasses
        ? Math.min(
            100,
            Math.round(
              ((totalClasses - currentLevel.minClasses) /
                (nextLevel.minClasses - currentLevel.minClasses)) *
                100,
            ),
          )
        : currentLevel && !nextLevel
          ? 100
          : 0;

    const lastAttended = pastBookings.find((b) => b.status === "ATTENDED");
    const lastVisitDate = lastAttended
      ? new Date(lastAttended.class.startsAt)
      : null;
    const daysSinceLastVisit = lastVisitDate
      ? Math.floor((now.getTime() - lastVisitDate.getTime()) / 86400000)
      : null;

    const paymentRefMap = await resolveRefMap(stripePayments, posTransactions);

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      phone: user.phone,
      birthday: user.birthday?.toISOString() ?? null,
      instagramUser: user.instagramUser,
      stravaUser: user.stravaUser,
      memberSince: membership.createdAt.toISOString(),
      pwaInstalledAt: membership.pwaInstalledAt?.toISOString() ?? null,
      lastSeenAt: membership.lastSeenAt?.toISOString() ?? null,
      role: membership.role,

      stats: {
        totalClasses,
        classesThisMonth,
        totalBookings,
        currentStreak: progress?.currentStreak ?? 0,
        longestStreak: progress?.longestStreak ?? 0,
        daysSinceLastVisit,
      },

      level: currentLevel
        ? { name: currentLevel.name, icon: currentLevel.icon, color: currentLevel.color, minClasses: currentLevel.minClasses }
        : null,
      nextLevel: nextLevel
        ? { name: nextLevel.name, icon: nextLevel.icon, color: nextLevel.color, minClasses: nextLevel.minClasses }
        : null,
      progressPercent,
      classesToNext,

      achievements: allAchievements.map((a) => {
        const earned = achievements.find((e) => e.achievementId === a.id);
        return {
          id: a.id,
          key: a.key,
          name: a.name,
          icon: a.icon,
          description: a.description,
          earned: earnedIds.has(a.id),
          earnedAt: earned?.earnedAt?.toISOString() ?? null,
        };
      }),

      packages: packages.map((p) => ({
        id: p.id,
        name: p.package.name,
        type: p.package.type,
        creditsTotal: p.creditsTotal,
        creditsUsed: p.creditsUsed,
        creditsRemaining:
          p.creditsTotal === null ? -1 : p.creditsTotal - p.creditsUsed,
        expiresAt: p.expiresAt.toISOString(),
        isActive: new Date(p.expiresAt) > now,
      })),

      upcomingBookings: upcomingBookings.map((b) => ({
        id: b.id,
        classId: b.classId,
        className: b.class.classType.name,
        classColor: b.class.classType.color,
        coachName: b.class.coach.name,
        roomName: b.class.room.name,
        startsAt: b.class.startsAt.toISOString(),
        endsAt: b.class.endsAt.toISOString(),
        status: b.status,
        spotNumber: b.spotNumber,
      })),

      pastBookings: pastBookings.map((b) => ({
        id: b.id,
        classId: b.classId,
        className: b.class.classType.name,
        classColor: b.class.classType.color,
        coachName: b.class.coach.name,
        startsAt: b.class.startsAt.toISOString(),
        status: b.status,
      })),

      subscriptions: memberSubscriptions.map((s) => ({
        id: s.id,
        stripeSubscriptionId: s.stripeSubscriptionId,
        status: s.status,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        currentPeriodStart: s.currentPeriodStart.toISOString(),
        currentPeriodEnd: s.currentPeriodEnd.toISOString(),
        pausedAt: s.pausedAt?.toISOString() ?? null,
        resumesAt: s.resumesAt?.toISOString() ?? null,
        canceledAt: s.canceledAt?.toISOString() ?? null,
        package: {
          id: s.package.id,
          name: s.package.name,
          price: s.package.price,
          currency: s.package.currency,
          recurringInterval: s.package.recurringInterval,
        },
      })),

      paymentHistory: buildPaymentHistory(stripePayments, posTransactions, paymentRefMap),
      revenueSummary: buildRevenueSummary(stripePayments, posTransactions, paymentRefMap, yearStart, monthStart),
    });
  } catch (error) {
    console.error("GET /api/admin/clients/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
