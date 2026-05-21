import { prisma } from "@/lib/db";
import { isSameWeek } from "date-fns";
import {
  normalizeRules,
  rulesAreOpen,
  type SongRequestRule,
} from "@/lib/song-rules";

const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500];

// Streamed to clients via the song-request API. When `eligible=false` and the
// gate is a "progressable" rule (level/subscription), `lock` is populated so
// the booking UI can render a locked-but-visible state with a CTA.
export type SongRequestLock =
  | {
      type: "LEVEL_AT_LEAST";
      requiredLevel: {
        id: string;
        name: string;
        minClasses: number;
        sortOrder: number;
      };
      currentLevel: { id: string; name: string; sortOrder: number } | null;
      classesAttended: number;
      classesRemaining: number;
    }
  | {
      type: "SUBSCRIPTION";
      allowedPackages: { id: string; name: string }[];
    };

export type SongEligibilityResult = {
  eligible: boolean;
  lock: SongRequestLock | null;
};

/**
 * Decides whether a member can suggest a song for a given class and, when
 * not, whether to surface a progress / CTA hint to the UI.
 *
 * Rules are OR'd: matching ANY rule grants eligibility. The lock is only
 * populated when no rule matched AND at least one rule is "progressable"
 * (LEVEL_AT_LEAST or SUBSCRIPTION). Pure legacy criteria (birthday, first
 * class, milestone) silently hide the feature — they aren't actionable.
 */
export async function checkSongEligibility(
  userId: string,
  classStartsAt: Date,
  rawRules: unknown,
  tenantId: string,
): Promise<SongEligibilityResult> {
  const rules = normalizeRules(rawRules);
  if (rulesAreOpen(rules)) return { eligible: true, lock: null };

  // Cache user once; several rule evaluators want it.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthday: true },
  });

  let attendedCount: number | null = null;
  const getAttended = async () => {
    if (attendedCount !== null) return attendedCount;
    attendedCount = await prisma.booking.count({
      where: { userId, tenantId, status: "ATTENDED" },
    });
    return attendedCount;
  };

  for (const rule of rules) {
    if (await matchesRule(rule, { userId, tenantId, classStartsAt, user, getAttended })) {
      return { eligible: true, lock: null };
    }
  }

  // No match — try to build a lock from the most actionable rule.
  const lock = await buildLock(rules, { userId, tenantId, getAttended });
  return { eligible: false, lock };
}

type EvalCtx = {
  userId: string;
  tenantId: string;
  classStartsAt: Date;
  user: { birthday: Date | null } | null;
  getAttended: () => Promise<number>;
};

async function matchesRule(rule: SongRequestRule, ctx: EvalCtx): Promise<boolean> {
  switch (rule.type) {
    case "ALL":
      return true;
    case "BIRTHDAY_WEEK": {
      if (!ctx.user?.birthday) return false;
      const bday = new Date(ctx.user.birthday);
      const classDate = new Date(ctx.classStartsAt);
      const birthdayThisYear = new Date(
        classDate.getFullYear(),
        bday.getMonth(),
        bday.getDate(),
      );
      return isSameWeek(birthdayThisYear, classDate, { weekStartsOn: 1 });
    }
    case "ANNIVERSARY": {
      const firstBooking = await prisma.booking.findFirst({
        where: { userId: ctx.userId, tenantId: ctx.tenantId, status: "ATTENDED" },
        orderBy: { class: { startsAt: "asc" } },
        select: { class: { select: { startsAt: true } } },
      });
      if (!firstBooking) return false;
      const firstDate = firstBooking.class.startsAt;
      const classDate = new Date(ctx.classStartsAt);
      if (
        firstDate.getMonth() === classDate.getMonth() &&
        firstDate.getDate() === classDate.getDate() &&
        classDate.getFullYear() > firstDate.getFullYear()
      ) {
        return true;
      }
      return isSameWeek(
        new Date(classDate.getFullYear(), firstDate.getMonth(), firstDate.getDate()),
        classDate,
        { weekStartsOn: 1 },
      );
    }
    case "FIRST_CLASS": {
      const count = await prisma.booking.count({
        where: {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          status: { in: ["CONFIRMED", "ATTENDED"] },
        },
      });
      return count <= 1;
    }
    case "CLASS_MILESTONE": {
      const attended = await ctx.getAttended();
      return MILESTONES.includes(attended + 1);
    }
    case "LEVEL_AT_LEAST": {
      const required = await prisma.loyaltyLevel.findUnique({
        where: { id: rule.levelId },
        select: { sortOrder: true },
      });
      if (!required) return false;

      const progress = await prisma.memberProgress.findUnique({
        where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
        select: { currentLevel: { select: { sortOrder: true } } },
      });
      const currentSort = progress?.currentLevel?.sortOrder ?? -1;
      return currentSort >= required.sortOrder;
    }
    case "SUBSCRIPTION": {
      if (rule.packageIds.length === 0) return false;
      const count = await prisma.memberSubscription.count({
        where: {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          packageId: { in: rule.packageIds },
          status: { in: ["active", "trialing", "past_due"] },
        },
      });
      return count > 0;
    }
  }
}

async function buildLock(
  rules: SongRequestRule[],
  ctx: { userId: string; tenantId: string; getAttended: () => Promise<number> },
): Promise<SongRequestLock | null> {
  // Prefer the LEVEL_AT_LEAST lock with the lowest minClasses (easiest to reach)
  // — actionable progress beats a generic "buy a subscription" CTA.
  const levelRules = rules.filter(
    (r): r is Extract<SongRequestRule, { type: "LEVEL_AT_LEAST" }> =>
      r.type === "LEVEL_AT_LEAST",
  );

  if (levelRules.length > 0) {
    const levels = await prisma.loyaltyLevel.findMany({
      where: { id: { in: levelRules.map((r) => r.levelId) } },
      select: { id: true, name: true, minClasses: true, sortOrder: true },
      orderBy: { minClasses: "asc" },
    });
    const easiest = levels[0];
    if (easiest) {
      const progress = await prisma.memberProgress.findUnique({
        where: { userId_tenantId: { userId: ctx.userId, tenantId: ctx.tenantId } },
        select: {
          totalClassesAttended: true,
          currentLevel: { select: { id: true, name: true, sortOrder: true } },
        },
      });
      const attended = progress?.totalClassesAttended ?? (await ctx.getAttended());
      const classesRemaining = Math.max(0, easiest.minClasses - attended);
      return {
        type: "LEVEL_AT_LEAST",
        requiredLevel: {
          id: easiest.id,
          name: easiest.name,
          minClasses: easiest.minClasses,
          sortOrder: easiest.sortOrder,
        },
        currentLevel: progress?.currentLevel
          ? {
              id: progress.currentLevel.id,
              name: progress.currentLevel.name,
              sortOrder: progress.currentLevel.sortOrder,
            }
          : null,
        classesAttended: attended,
        classesRemaining,
      };
    }
  }

  const subRules = rules.filter(
    (r): r is Extract<SongRequestRule, { type: "SUBSCRIPTION" }> =>
      r.type === "SUBSCRIPTION",
  );
  if (subRules.length > 0) {
    const packageIds = Array.from(new Set(subRules.flatMap((r) => r.packageIds)));
    if (packageIds.length > 0) {
      const packages = await prisma.package.findMany({
        where: { id: { in: packageIds } },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      });
      if (packages.length > 0) {
        return { type: "SUBSCRIPTION", allowedPackages: packages };
      }
    }
  }

  return null;
}
