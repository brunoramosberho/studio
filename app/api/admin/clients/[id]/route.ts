import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

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
      select: { role: true, pwaInstalledAt: true, createdAt: true },
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

    const [upcomingBookings, pastBookings, totalBookings, classesThisMonth] =
      await Promise.all([
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
                coach: { select: { user: { select: { name: true } } } },
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
                coach: { select: { user: { select: { name: true } } } },
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
      role: membership.role,

      stats: {
        totalClasses,
        classesThisMonth,
        totalBookings,
        currentStreak: progress?.currentStreak ?? 0,
        longestStreak: progress?.longestStreak ?? 0,
        daysSinceLastVisit,
        freeClassCredits: progress?.freeClassCredits ?? 0,
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
        coachName: b.class.coach.user.name,
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
        coachName: b.class.coach.user.name,
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
    });
  } catch (error) {
    console.error("GET /api/admin/clients/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
