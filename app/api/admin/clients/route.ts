import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

type ClientFilter = "all" | "active" | "expiring" | "inactive" | "new" | "pwa";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

export async function GET(request: NextRequest) {
  const ctx = await requireRole("ADMIN", "FRONT_DESK");
  const tenantId = ctx.tenant.id;

  const params = request.nextUrl.searchParams;
  const filter = (params.get("filter") ?? "all") as ClientFilter;
  const search = params.get("search")?.trim() ?? "";
  const skip = Math.max(0, parseInt(params.get("skip") ?? "0", 10) || 0);
  const take = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(params.get("take") ?? `${PAGE_SIZE_DEFAULT}`, 10) || PAGE_SIZE_DEFAULT),
  );

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const userWhere: Prisma.UserWhereInput = {
    NOT: [
      { email: { contains: "filler" } },
      { email: { contains: "waitlist" } },
    ],
  };

  if (search) {
    userWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const baseWhere: Prisma.MembershipWhereInput = {
    tenantId,
    role: "CLIENT",
    user: userWhere,
  };

  switch (filter) {
    case "active":
      userWhere.packages = { some: { tenantId, expiresAt: { gt: now } } };
      break;
    case "expiring":
      userWhere.packages = {
        some: { tenantId, expiresAt: { gt: now, lte: sevenDaysFromNow } },
      };
      break;
    case "inactive":
      userWhere.AND = [
        { bookings: { some: { status: "ATTENDED", class: { tenantId } } } },
        {
          bookings: {
            none: {
              status: "ATTENDED",
              class: { tenantId, startsAt: { gte: fourteenDaysAgo } },
            },
          },
        },
      ];
      break;
    case "new":
      baseWhere.createdAt = { gte: thirtyDaysAgo };
      break;
    case "pwa":
      baseWhere.pwaInstalledAt = { not: null };
      break;
    case "all":
    default:
      break;
  }

  const [total, memberships] = await Promise.all([
    prisma.membership.count({ where: baseWhere }),
    prisma.membership.findMany({
      where: baseWhere,
      skip,
      take,
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
            packages: {
              where: { tenantId, expiresAt: { gt: now } },
              orderBy: { expiresAt: "desc" },
              take: 1,
              include: { package: { select: { name: true } } },
            },
            _count: {
              select: {
                bookings: { where: { class: { tenantId } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const userIds = memberships.map((m) => m.userId);

  // Per-user "this month" attended count + last attended class — done in
  // small aggregate queries instead of pulling the full booking history per
  // user (which was the 7MB-payload culprit on the previous design).
  const [thisMonthCounts, lastAttendedRows] = userIds.length
    ? await Promise.all([
        prisma.booking.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: "ATTENDED",
            class: { tenantId, startsAt: { gte: monthStart } },
          },
          _count: { id: true },
        }),
        prisma.$queryRaw<
          { userId: string; lastStartsAt: Date }[]
        >`
          SELECT b."userId" AS "userId", MAX(c."startsAt") AS "lastStartsAt"
          FROM "Booking" b
          INNER JOIN "Class" c ON c."id" = b."classId"
          WHERE b."userId" = ANY(${userIds}::text[])
            AND b."status" = 'ATTENDED'
            AND c."tenantId" = ${tenantId}
          GROUP BY b."userId"
        `,
      ])
    : [[], []];

  const thisMonthByUser = new Map(
    thisMonthCounts.map((r) => [r.userId!, r._count.id]),
  );
  const lastAttendedByUser = new Map(
    lastAttendedRows.map((r) => [r.userId, r.lastStartsAt]),
  );

  const clients = memberships.map((m) => {
    const u = m.user;
    const activePkg = u.packages[0] ?? null;
    const lastVisitedDate = lastAttendedByUser.get(u.id) ?? null;
    const daysSinceLastVisit = lastVisitedDate
      ? Math.floor((now.getTime() - lastVisitedDate.getTime()) / 86400000)
      : null;

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      memberSince: m.createdAt.toISOString(),
      pwaInstalledAt: m.pwaInstalledAt?.toISOString() ?? null,
      classesThisMonth: thisMonthByUser.get(u.id) ?? 0,
      daysSinceLastVisit,
      activePackage: activePkg
        ? {
            id: activePkg.id,
            packageName: activePkg.package.name,
            creditsRemaining:
              activePkg.creditsTotal === null
                ? -1
                : activePkg.creditsTotal - activePkg.creditsUsed,
            expiresAt: activePkg.expiresAt.toISOString(),
          }
        : null,
      bookingsCount: u._count.bookings,
      lastVisited: lastVisitedDate?.toISOString() ?? null,
    };
  });

  return NextResponse.json({
    clients,
    total,
    skip,
    take,
    hasMore: skip + clients.length < total,
  });
}
