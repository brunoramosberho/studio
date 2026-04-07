import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

type UserPackageRow = {
  creditsUsed: number;
  package: { name: string; type: string; credits: number | null };
  [key: string]: unknown;
};

function pickBestPackage(packages: UserPackageRow[]): UserPackageRow | null {
  if (packages.length === 0) return null;

  // Unlimited packages (credits is null) always win
  const unlimited = packages.find((p) => p.package.credits == null);
  if (unlimited) return unlimited;

  // Among credit-based, pick the one with most remaining credits
  const withCredits = packages
    .map((p) => ({
      pkg: p,
      remaining: (p.package.credits ?? 0) - (p.creditsUsed ?? 0),
    }))
    .filter((p) => p.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  if (withCredits.length > 0) return withCredits[0].pkg;

  // All depleted — return the one expiring last (first in our desc-sorted list)
  return packages[0];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");
    const { classId } = await params;

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      select: { id: true, startsAt: true, endsAt: true, coachId: true },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const bookings = await prisma.booking.findMany({
      where: { classId, status: { in: ["CONFIRMED", "ATTENDED"] } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
            birthday: true,
            createdAt: true,
            packages: {
              where: {
                tenantId: ctx.tenant.id,
                expiresAt: { gte: new Date() },
              },
              include: { package: { select: { name: true, type: true, credits: true } } },
              orderBy: { expiresAt: "desc" },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const checkIns = await prisma.checkIn.findMany({
      where: { classId },
      select: { memberId: true, status: true, method: true, createdAt: true },
    });
    const checkInMap = new Map(checkIns.map((ci) => [ci.memberId, ci]));

    // Compute attendee stats (same logic as /api/classes/[id])
    const userIds = bookings.filter((b) => b.user).map((b) => b.user!.id);

    const [totalCounts, coachCounts, cancelCounts, allBookingCounts] = userIds.length > 0
      ? await Promise.all([
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { in: ["ATTENDED", "CONFIRMED"] } },
            _count: true,
          }),
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { in: ["ATTENDED", "CONFIRMED"] }, class: { coachId: cls.coachId } },
            _count: true,
          }),
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { in: ["CANCELLED", "NO_SHOW"] } },
            _count: true,
          }),
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds } },
            _count: true,
          }),
        ])
      : [[], [], [], []];

    const totalMap = new Map(totalCounts.map((r) => [r.userId, r._count]));
    const coachMap = new Map(coachCounts.map((r) => [r.userId, r._count]));
    const cancelMap = new Map(cancelCounts.map((r) => [r.userId, r._count]));
    const allMap = new Map(allBookingCounts.map((r) => [r.userId, r._count]));

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const roster = bookings
      .filter((b) => b.user)
      .map((b) => {
        const user = b.user!;
        const ci = checkInMap.get(user.id) ?? null;

        // Pick best package: unlimited first, then most remaining credits
        const activePackage = pickBestPackage(user.packages);

        const nameParts = (user.name ?? "").trim().split(/\s+/);
        const initials = nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
          : (nameParts[0]?.[0] ?? "?").toUpperCase();

        const hasExpiredMembership = !activePackage;
        const isUnlimited = activePackage?.package.credits == null;
        const remainingCredits = activePackage?.package.credits != null
          ? Math.max(0, activePackage.package.credits - (activePackage.creditsUsed ?? 0))
          : null;

        // Stats
        const uid = user.id;
        const totalClasses = totalMap.get(uid) ?? 0;
        const classesWithCoach = coachMap.get(uid) ?? 0;
        const cancelled = cancelMap.get(uid) ?? 0;
        const allBookings = allMap.get(uid) ?? 0;
        const cancelRate = allBookings >= 3 ? Math.round((cancelled / allBookings) * 100) : null;
        const isNewMember = user.createdAt >= thirtyDaysAgo;
        const isFirstEver = totalClasses <= 1;
        const isFirstWithCoach = classesWithCoach <= 1;
        const isTopClient = totalClasses >= 10;

        let birthdayLabel: string | null = null;
        if (user.birthday) {
          const bday = new Date(user.birthday);
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
          const thisYearBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());
          if (thisYearBday.getTime() === todayDate.getTime()) {
            birthdayLabel = "today";
          } else if (thisYearBday.getTime() === yesterdayDate.getTime()) {
            birthdayLabel = "yesterday";
          } else if (thisYearBday >= todayDate && thisYearBday <= weekFromNow) {
            birthdayLabel = "this_week";
          }
        }

        const memberSince = user.createdAt.toISOString();

        return {
          memberId: user.id,
          memberName: user.name,
          memberImage: user.image,
          initials,
          membershipType: activePackage?.package.name ?? "Sin paquete",
          membershipPackageType: activePackage?.package.type ?? null,
          remainingClasses: remainingCredits,
          isUnlimited,
          hasPaymentPending: hasExpiredMembership,
          memberSince,
          checkIn: ci
            ? { status: ci.status, method: ci.method, createdAt: ci.createdAt.toISOString() }
            : null,
          stats: {
            totalClasses,
            classesWithCoach,
            isNewMember,
            isFirstEver,
            isFirstWithCoach,
            isTopClient,
            birthdayLabel,
            cancelRate,
          },
        };
      });

    roster.sort((a, b) => {
      if (a.checkIn && !b.checkIn) return -1;
      if (!a.checkIn && b.checkIn) return 1;
      return (a.memberName ?? "").localeCompare(b.memberName ?? "");
    });

    const waitlist = await prisma.waitlist.findMany({
      where: { classId },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
      orderBy: { position: "asc" },
    });

    const waitlistData = waitlist.map((w) => ({
      memberId: w.user.id,
      memberName: w.user.name,
      memberImage: w.user.image,
      position: w.position,
      since: w.createdAt.toISOString(),
    }));

    return NextResponse.json({ roster, waitlist: waitlistData });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/check-in/roster error:", error);
    return NextResponse.json({ error: "Failed to fetch roster" }, { status: 500 });
  }
}
