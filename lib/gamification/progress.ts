import { prisma } from "@/lib/db";
import { startOfWeek } from "date-fns";

/**
 * Recalcula estadísticas de gamificación desde reservas ATTENDED del tenant.
 */
export async function syncMemberProgressFromBookings(
  userId: string,
  tenantId: string,
): Promise<{
  totalClassesAttended: number;
  currentStreak: number;
  longestStreak: number;
  lastClassDate: Date | null;
}> {
  const attendedBookings = await prisma.booking.findMany({
    where: { userId, tenantId, status: "ATTENDED" },
    include: { class: { select: { startsAt: true } } },
    orderBy: { class: { startsAt: "asc" } },
  });

  const totalClassesAttended = attendedBookings.length;

  const attendedDays = [
    ...new Set(
      attendedBookings.map((b) =>
        new Date(b.class.startsAt).toISOString().slice(0, 10),
      ),
    ),
  ].sort();

  let longestStreak = attendedDays.length > 0 ? 1 : 0;
  let currentStreak = 1;
  for (let i = 1; i < attendedDays.length; i++) {
    const prev = new Date(attendedDays[i - 1]);
    const curr = new Date(attendedDays[i]);
    const diffDays =
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let activeStreak = 0;
  if (attendedDays.length > 0) {
    const lastDay = attendedDays[attendedDays.length - 1];
    if (lastDay === todayStr || lastDay === yesterdayStr) {
      activeStreak = 1;
      for (let i = attendedDays.length - 2; i >= 0; i--) {
        const curr = new Date(attendedDays[i + 1]);
        const prev = new Date(attendedDays[i]);
        const diff =
          (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) activeStreak++;
        else break;
      }
    }
  }

  const lastClassDate =
    attendedBookings.length > 0
      ? new Date(attendedBookings[attendedBookings.length - 1].class.startsAt)
      : null;

  const lastDateOnly = lastClassDate
    ? new Date(
        Date.UTC(
          lastClassDate.getUTCFullYear(),
          lastClassDate.getUTCMonth(),
          lastClassDate.getUTCDate(),
        ),
      )
    : null;

  await prisma.memberProgress.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: {
      userId,
      tenantId,
      totalClassesAttended,
      currentStreak: activeStreak,
      longestStreak,
      lastClassDate: lastDateOnly,
    },
    update: {
      totalClassesAttended,
      currentStreak: activeStreak,
      longestStreak,
      lastClassDate: lastDateOnly,
    },
  });

  return {
    totalClassesAttended,
    currentStreak: activeStreak,
    longestStreak,
    lastClassDate,
  };
}

export function maxClassesInSingleWeek(
  attendedBookings: { class: { startsAt: Date } }[],
): number {
  const weekCounts = new Map<string, number>();
  for (const b of attendedBookings) {
    const ws = startOfWeek(new Date(b.class.startsAt), { weekStartsOn: 1 });
    const key = ws.toISOString();
    weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...weekCounts.values());
}

/**
 * Longest consecutive weekly streak: how many consecutive calendar weeks
 * (Mon-Sun) the user attended at least 1 class.
 */
export function longestWeeklyStreak(
  attendedBookings: { class: { startsAt: Date } }[],
): number {
  if (attendedBookings.length === 0) return 0;

  const weekKeys = new Set<string>();
  for (const b of attendedBookings) {
    const ws = startOfWeek(new Date(b.class.startsAt), { weekStartsOn: 1 });
    weekKeys.add(ws.toISOString().slice(0, 10));
  }

  const sorted = [...weekKeys].sort();
  if (sorted.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 7) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

/**
 * Count of distinct class type names the user has attended.
 */
export function distinctClassTypes(
  attendedBookings: { class: { classType: { name: string } } }[],
): number {
  const names = new Set(attendedBookings.map((b) => b.class.classType.name));
  return names.size;
}

/**
 * Detect if the current class is a comeback after N+ days of inactivity.
 */
export function detectComeback(
  attendedBookings: { class: { startsAt: Date } }[],
  thresholdDays: number,
): boolean {
  if (attendedBookings.length < 2) return false;
  const sorted = [...attendedBookings].sort(
    (a, b) => new Date(a.class.startsAt).getTime() - new Date(b.class.startsAt).getTime(),
  );
  const last = new Date(sorted[sorted.length - 1].class.startsAt);
  const secondLast = new Date(sorted[sorted.length - 2].class.startsAt);
  const gapDays = (last.getTime() - secondLast.getTime()) / (1000 * 60 * 60 * 24);
  return gapDays >= thresholdDays;
}
