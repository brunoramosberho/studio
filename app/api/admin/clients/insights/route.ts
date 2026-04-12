import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

export async function GET() {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const tenantId = ctx.tenant.id;

    const now = new Date();
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // -- At risk: members who attended before but not in last 14 days --
    const allClientMemberships = await prisma.membership.findMany({
      where: { tenantId, role: "CLIENT" },
      select: { userId: true },
    });
    const clientIds = allClientMemberships.map((m) => m.userId);

    const [recentAttendees, historicalAttendees] = await Promise.all([
      prisma.booking.findMany({
        where: {
          userId: { in: clientIds },
          status: "ATTENDED",
          class: { tenantId, startsAt: { gte: fourteenDaysAgo } },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.booking.findMany({
        where: {
          userId: { in: clientIds },
          status: "ATTENDED",
          class: { tenantId, startsAt: { lt: fourteenDaysAgo } },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

    const recentSet = new Set(recentAttendees.map((b) => b.userId));
    const atRiskIds = historicalAttendees
      .map((b) => b.userId!)
      .filter((id) => !recentSet.has(id));

    let atRisk: {
      id: string;
      name: string | null;
      image: string | null;
      email: string;
      lastClass: string | null;
      daysSinceLastVisit: number | null;
    }[] = [];

    if (atRiskIds.length > 0) {
      const atRiskUsers = await prisma.user.findMany({
        where: { id: { in: atRiskIds.slice(0, 20) } },
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          bookings: {
            where: {
              status: "ATTENDED",
              class: { tenantId },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              class: {
                select: {
                  startsAt: true,
                  classType: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      atRisk = atRiskUsers
        .map((u) => {
          const lastBooking = u.bookings[0];
          const lastDate = lastBooking
            ? new Date(lastBooking.class.startsAt)
            : null;
          return {
            id: u.id,
            name: u.name,
            image: u.image,
            email: u.email,
            lastClass: lastBooking
              ? `${lastBooking.class.classType.name} - ${lastDate!.toLocaleDateString("es")}`
              : null,
            daysSinceLastVisit: lastDate
              ? Math.floor(
                  (now.getTime() - lastDate.getTime()) / 86400000,
                )
              : null,
          };
        })
        .sort(
          (a, b) =>
            (b.daysSinceLastVisit ?? 999) - (a.daysSinceLastVisit ?? 999),
        );
    }

    // -- Top members --
    const [topThisMonth, topAllTime, socialActivity] = await Promise.all([
      // Most classes this month
      prisma.booking.groupBy({
        by: ["userId"],
        where: {
          status: "ATTENDED",
          userId: { not: null },
          class: { tenantId, startsAt: { gte: monthStart } },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      }),

      // Most classes all time
      prisma.booking.groupBy({
        by: ["userId"],
        where: {
          status: "ATTENDED",
          userId: { not: null },
          class: { tenantId },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      }),

      // Most social activity (likes + comments)
      prisma.$queryRaw<
        { userId: string; activity: bigint }[]
      >`
        SELECT u."id" AS "userId",
          (
            (SELECT COUNT(*) FROM "Like" l
             INNER JOIN "FeedEvent" fe ON fe."id" = l."feedEventId"
             WHERE l."userId" = u."id" AND fe."tenantId" = ${tenantId})
            +
            (SELECT COUNT(*) FROM "Comment" c
             INNER JOIN "FeedEvent" fe ON fe."id" = c."feedEventId"
             WHERE c."userId" = u."id" AND fe."tenantId" = ${tenantId})
          ) AS "activity"
        FROM "User" u
        INNER JOIN "Membership" m ON m."userId" = u."id"
        WHERE m."tenantId" = ${tenantId} AND m."role" = 'CLIENT'
        ORDER BY "activity" DESC
        LIMIT 5
      `,
    ]);

    const userIdsToFetch = new Set<string>();
    for (const r of topThisMonth) if (r.userId) userIdsToFetch.add(r.userId);
    for (const r of topAllTime) if (r.userId) userIdsToFetch.add(r.userId);
    for (const r of socialActivity) userIdsToFetch.add(r.userId);

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(userIdsToFetch) } },
      select: { id: true, name: true, image: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const mapRanking = (
      items: { userId: string | null; _count?: { id: number }; activity?: bigint }[],
      valueKey: "count" | "activity",
    ) =>
      items
        .filter((r) => r.userId)
        .map((r) => {
          const u = userMap.get(r.userId!);
          return {
            id: r.userId!,
            name: u?.name ?? null,
            image: u?.image ?? null,
            value:
              valueKey === "count"
                ? r._count!.id
                : Number(r.activity ?? 0),
          };
        });

    return NextResponse.json({
      atRisk,
      topMembers: {
        mostClassesThisMonth: mapRanking(topThisMonth, "count"),
        mostClassesAllTime: mapRanking(topAllTime, "count"),
        mostSocialActivity: mapRanking(socialActivity, "activity"),
      },
    });
  } catch (error) {
    console.error("GET /api/admin/clients/insights error:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 },
    );
  }
}
