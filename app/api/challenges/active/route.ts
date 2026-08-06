import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { challengeEndsAt } from "@/lib/challenges/input";
import { daysElapsed } from "@/lib/challenges/engine";
import { pace, PACE_MIN_DAYS } from "@/lib/challenges/scoring";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";
import { calendarDaysBetween, formatDateInZone } from "@/lib/utils";

/**
 * Everything the member's challenge surfaces need, in one request: the live
 * challenge, where they stand, the scoreboard, and which of those people are
 * already their friends.
 */
export async function GET() {
  try {
    const { session, tenant } = await requireAuth();
    const userId = session.user.id;

    const challenge = await prisma.challenge.findFirst({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) return NextResponse.json({ challenge: null });

    const now = new Date();
    const [participants, friendships] = await Promise.all([
      prisma.challengeParticipant.findMany({
        where: { challengeId: challenge.id },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      }),
      prisma.friendship.findMany({
        where: {
          tenantId: tenant.id,
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        select: { requesterId: true, addresseeId: true, status: true },
      }),
    ]);

    const friendState = new Map<string, "ACCEPTED" | "PENDING" | "DECLINED">();
    for (const f of friendships) {
      const other = f.requesterId === userId ? f.addresseeId : f.requesterId;
      friendState.set(other, f.status);
    }

    const mine = participants.find((p) => p.userId === userId) ?? null;

    const rows = participants.map((p) => {
      const elapsed = daysElapsed(p, now);
      return {
        userId: p.userId,
        name: p.user.name,
        image: p.user.image,
        startsAt: p.startsAt,
        totalPoints: p.totalPoints,
        classesCount: p.classesCount,
        currentStreak: p.currentStreak,
        longestStreak: p.longestStreak,
        daysElapsed: elapsed,
        // Windows are staggered, so raw totals favour whoever started first.
        // Pace is the fair comparison; below the floor it's too noisy to rank.
        pace: p.startsAt ? pace(p.totalPoints, elapsed) : null,
        isMe: p.userId === userId,
        friendStatus: p.userId === userId ? null : (friendState.get(p.userId) ?? null),
      };
    });

    // What's still worth points for this member — the checklist that makes the
    // variety bonuses visible instead of a surprise at the end.
    let progress = null;
    if (mine) {
      const [entries, classTypes, coaches] = await Promise.all([
        prisma.challengePointEntry.findMany({
          where: { participantId: mine.id },
          select: { classTypeId: true, coachId: true, kind: true, classId: true },
        }),
        // Only what's still bookable: a checklist that lists a discipline
        // nobody teaches any more is a bonus the member can never collect.
        prisma.classType.findMany({
          where: {
            tenantId: tenant.id,
            classes: { some: { startsAt: { gte: now }, status: "SCHEDULED" } },
          },
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        }),
        prisma.coachProfile.findMany({
          where: {
            tenantId: tenant.id,
            classes: { some: { startsAt: { gte: now }, status: "SCHEDULED" } },
          },
          select: { id: true, name: true, photoUrl: true },
          orderBy: { name: "asc" },
        }),
      ]);
      const triedTypes = new Set(entries.map((e) => e.classTypeId));
      const triedCoaches = new Set(entries.map((e) => e.coachId));
      progress = {
        disciplines: classTypes.map((c) => ({ ...c, tried: triedTypes.has(c.id) })),
        coaches: coaches.map((c) => ({ ...c, tried: triedCoaches.has(c.id) })),
        // Classes whose photo bonus is already banked — the feed uses this to
        // stop promising points a second upload wouldn't pay.
        photoClassIds: [
          ...new Set(entries.filter((e) => e.kind === "PHOTO").map((e) => e.classId)),
        ],
      };
    }

    const enrollmentOpen =
      now >= challenge.enrollOpensAt && now <= challenge.enrollClosesAt;

    // The deadline was stored as end-of-day in the studio's timezone, so it has
    // to be read back the same way. Counting raw milliseconds would tell a
    // member in Mexico the wrong day for a Madrid studio, and vice versa —
    // and this is the one date they cannot afford to get wrong.
    const timezone = await resolveScheduleTimezone(tenant);
    const enrollDaysLeft = calendarDaysBetween(
      formatDateInZone(now, timezone),
      formatDateInZone(challenge.enrollClosesAt, timezone),
    );

    return NextResponse.json({
      timezone,
      // 0 means today is the last day; negative means it has passed.
      enrollDaysLeft,
      challenge: {
        id: challenge.id,
        name: challenge.name,
        description: challenge.description,
        imageUrl: challenge.imageUrl,
        durationDays: challenge.durationDays,
        enrollOpensAt: challenge.enrollOpensAt,
        enrollClosesAt: challenge.enrollClosesAt,
        endsAt: challengeEndsAt(challenge.enrollClosesAt, challenge.durationDays),
        basePoints: challenge.basePoints,
        firstDisciplineBonus: challenge.firstDisciplineBonus,
        firstCoachBonus: challenge.firstCoachBonus,
        photoBonus: challenge.photoBonus,
        dailyPointsCap: challenge.dailyPointsCap,
        bonusSlots: challenge.bonusSlots,
        prizes: challenge.prizes,
      },
      enrollmentOpen,
      paceMinDays: PACE_MIN_DAYS,
      participantCount: participants.length,
      me: mine
        ? {
            joinedAt: mine.joinedAt,
            startsAt: mine.startsAt,
            endsAt: mine.endsAt,
            totalPoints: mine.totalPoints,
            classesCount: mine.classesCount,
            currentStreak: mine.currentStreak,
            longestStreak: mine.longestStreak,
            daysLeft: mine.endsAt
              ? Math.max(
                  0,
                  Math.ceil((mine.endsAt.getTime() - now.getTime()) / 86_400_000),
                )
              : null,
            finished: mine.endsAt ? mine.endsAt < now : false,
          }
        : null,
      progress,
      scoreboard: rows,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["Unauthorized", "Not a member of this studio", "Tenant not found"].includes(
        error.message,
      )
    ) {
      return NextResponse.json({ challenge: null });
    }
    console.error("GET /api/challenges/active error:", error);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
