import { prisma } from "@/lib/db";
import { getTenantHolidaySet, holidayKey } from "@/lib/holidays/calendar";

/**
 * Single source of truth for coach compensation.
 *
 * A coach has one or more CoachPayRate rows. MONTHLY_FIXED is a flat base that
 * always applies. The per-class types (PER_CLASS / PER_STUDENT / OCCUPANCY_TIER)
 * are matched to each class by scope (studio / class type): among the rates of
 * the SAME type that match a class, the MOST SPECIFIC wins (studio+type >
 * studio > type > any) — they don't stack within a type, but a class can earn
 * under more than one type (e.g. a per-class rate plus an occupancy bonus).
 *
 * Bonuses: a rate's bonusMultiplier applies to a class when it falls on a bonus
 * weekday, carries a bonus tag, or lands on a public holiday (per the rate's
 * flags). Returns per-class line items (for detail/export) plus totals split
 * into already-taught ("earned") vs upcoming ("projected").
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CoachPayClassLine {
  classId: string;
  startsAt: Date;
  classTypeId: string;
  classTypeName: string;
  classTypeColor: string;
  studioId: string | null;
  studioName: string;
  roomName: string;
  capacity: number;
  /** Billable seats the pay is based on (attended + chargedNoShows + chargedLateCancels, capped at capacity). */
  attendees: number;
  /** Physically present or still-booked (CONFIRMED + ATTENDED). */
  attended: number;
  /** No-shows the studio charged for (lost credit or charged a fee). */
  chargedNoShows: number;
  /** Late cancellations that forfeited the credit (studio kept the money). */
  chargedLateCancels: number;
  /** True when raw billable exceeded capacity and was capped (e.g. rebooked seats). */
  capped: boolean;
  occupancyPct: number;
  rateType: "PER_CLASS" | "PER_STUDENT" | "OCCUPANCY_TIER";
  rateLabel: string;
  multiplier: number;
  amount: number;
  isPast: boolean;
}

export interface CoachPayResult {
  total: number;
  earnedSoFar: number;
  projected: number;
  monthlyFixed: number;
  breakdown: { type: string; label: string; amount: number }[];
  classLines: CoachPayClassLine[];
  classesCount: number;
  currency: string;
  hasRates: boolean;
}

/** One rate applied to a class (a class can earn under more than one rate type). */
export interface CoachEarningLine {
  rateType: CoachPayClassLine["rateType"];
  /** Server-formatted formula, e.g. "150/clase", "50/alumno × 8", "Tier 10-15 → 200". */
  rateLabel: string;
  multiplier: number;
  amount: number;
}

/** Per-class earning for the coach's own view: the total plus the seat breakdown
 *  and the rate lines behind it, so the coach sees exactly how it was computed. */
export interface CoachClassEarning {
  id: string;
  startsAt: Date;
  className: string;
  classColor: string;
  capacity: number;
  occupancy: number;
  /** Billable seats the pay is based on (attended + charged no-shows + late cancels, capped). */
  billableSeats: number;
  attended: number;
  chargedNoShows: number;
  chargedLateCancels: number;
  capped: boolean;
  isPast: boolean;
  earned: number;
  lines: CoachEarningLine[];
}

/**
 * Collapse computeCoachPay's per-(class × rate) lines into one row per class:
 * sums the amounts and keeps each rate line (the "how it was calculated"),
 * carrying the seat breakdown through. Sorted by class time.
 */
export function collapseClassEarnings(
  classLines: CoachPayClassLine[],
): CoachClassEarning[] {
  const byClass = new Map<string, CoachClassEarning>();
  for (const l of classLines) {
    let row = byClass.get(l.classId);
    if (!row) {
      row = {
        id: l.classId,
        startsAt: l.startsAt,
        className: l.classTypeName,
        classColor: l.classTypeColor,
        capacity: l.capacity,
        occupancy: l.occupancyPct,
        billableSeats: l.attendees,
        attended: l.attended,
        chargedNoShows: l.chargedNoShows,
        chargedLateCancels: l.chargedLateCancels,
        capped: l.capped,
        isPast: l.isPast,
        earned: 0,
        lines: [],
      };
      byClass.set(l.classId, row);
    }
    row.earned = round2(row.earned + l.amount);
    row.lines.push({
      rateType: l.rateType,
      rateLabel: l.rateLabel,
      multiplier: l.multiplier,
      amount: l.amount,
    });
  }
  return Array.from(byClass.values()).sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
}

const TYPE_LABEL: Record<string, string> = {
  MONTHLY_FIXED: "Sueldo fijo mensual",
  PER_CLASS: "Por clase",
  PER_STUDENT: "Por alumno",
  OCCUPANCY_TIER: "Bono por ocupación",
};

export async function computeCoachPay(
  coachProfileId: string,
  tenantId: string,
  from: Date,
  to: Date,
  fallbackCurrencyCode: string,
  now: Date = new Date(),
): Promise<CoachPayResult> {
  const empty: CoachPayResult = {
    total: 0,
    earnedSoFar: 0,
    projected: 0,
    monthlyFixed: 0,
    breakdown: [],
    classLines: [],
    classesCount: 0,
    currency: fallbackCurrencyCode,
    hasRates: false,
  };

  const payRates = await prisma.coachPayRate.findMany({
    where: {
      coachProfileId,
      tenantId,
      isActive: true,
      effectiveFrom: { lte: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
    },
  });
  if (payRates.length === 0) return empty;

  const classes = await prisma.class.findMany({
    where: {
      coachId: coachProfileId,
      tenantId,
      startsAt: { gte: from, lte: to },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      classTypeId: true,
      startsAt: true,
      tag: true,
      classType: { select: { name: true, color: true } },
      room: {
        select: {
          name: true,
          maxCapacity: true,
          studioId: true,
          studio: { select: { name: true } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  // Billable seats split into their parts so admin + coach can see *why* a class
  // counts what it does. The studio earned from a seat — so it's billable — when:
  //   • attended  — CONFIRMED / ATTENDED (booked or showed up).
  //   • no-show   — the credit was forfeited (creditLost) or a fee was charged
  //                 (e.g. an unlimited member with no credit to lose).
  //   • late cancel — the credit was forfeited (an on-time cancel restores it, so
  //                 creditLost stays false and the freed seat earns nothing).
  const classIds = classes.map((c) => c.id);
  const [attendedRows, noShowRows, lateCancelRows] = await Promise.all([
    prisma.booking.groupBy({
      by: ["classId"],
      where: { tenantId, classId: { in: classIds }, status: { in: ["CONFIRMED", "ATTENDED"] } },
      _count: true,
    }),
    prisma.booking.groupBy({
      by: ["classId"],
      where: {
        tenantId,
        classId: { in: classIds },
        status: "NO_SHOW",
        OR: [{ creditLost: true }, { pendingPenalty: { is: { status: "confirmed", chargeFee: true } } }],
      },
      _count: true,
    }),
    prisma.booking.groupBy({
      by: ["classId"],
      where: { tenantId, classId: { in: classIds }, status: "CANCELLED", creditLost: true },
      _count: true,
    }),
  ]);
  const attendedMap = new Map(attendedRows.map((r) => [r.classId, r._count]));
  const noShowMap = new Map(noShowRows.map((r) => [r.classId, r._count]));
  const lateCancelMap = new Map(lateCancelRows.map((r) => [r.classId, r._count]));

  const holidaySet = await getTenantHolidaySet(tenantId, from, to);

  type Rate = (typeof payRates)[number];
  type Cls = (typeof classes)[number];

  const getMultiplier = (rate: Rate, classStartsAt: Date, classTag: string | null) => {
    const bm = rate.bonusMultiplier ?? 1;
    if (bm <= 1) return 1;
    const days = (rate.bonusDays as number[] | null) ?? [];
    const tags = rate.bonusTags ?? [];
    const dayMatch = days.length > 0 && days.includes(classStartsAt.getDay());
    const tagMatch = tags.length > 0 && !!classTag && tags.includes(classTag);
    const holidayMatch = rate.bonusOnHolidays && holidaySet.has(holidayKey(classStartsAt));
    return dayMatch || tagMatch || holidayMatch ? bm : 1;
  };

  const rateMatchesClass = (rate: Rate, cls: Cls) => {
    if (rate.studioId && rate.studioId !== cls.room.studioId) return false;
    if (rate.classTypeId && rate.classTypeId !== cls.classTypeId) return false;
    // A rate only applies to classes within its validity window, so
    // date-bounded rates (e.g. an opening-weekend flat rate) don't bleed into
    // other days or stack with the regular tier rate.
    const start = new Date(cls.startsAt);
    if (start < new Date(rate.effectiveFrom)) return false;
    if (rate.effectiveTo && start > new Date(rate.effectiveTo)) return false;
    return true;
  };
  const specificity = (rate: Rate) => (rate.studioId ? 2 : 0) + (rate.classTypeId ? 1 : 0);

  const PER_CLASS_TYPES = ["PER_CLASS", "PER_STUDENT", "OCCUPANCY_TIER"] as const;

  const classLines: CoachPayClassLine[] = [];
  const breakdownMap = new Map<string, { type: string; label: string; amount: number }>();
  let total = 0;
  let earnedSoFar = 0;
  let projected = 0;
  let monthlyFixed = 0;

  const addBreakdown = (type: string, amount: number) => {
    const cur = breakdownMap.get(type) ?? { type, label: TYPE_LABEL[type] ?? type, amount: 0 };
    cur.amount += amount;
    breakdownMap.set(type, cur);
  };

  // Flat monthly salary — always applies, counts as already earned.
  for (const rate of payRates) {
    if (rate.type !== "MONTHLY_FIXED") continue;
    total += rate.amount;
    earnedSoFar += rate.amount;
    monthlyFixed += rate.amount;
    addBreakdown("MONTHLY_FIXED", rate.amount);
  }

  for (const cls of classes) {
    const startsAt = new Date(cls.startsAt);
    const isPast = startsAt < now;
    const attended = attendedMap.get(cls.id) ?? 0;
    const chargedNoShows = noShowMap.get(cls.id) ?? 0;
    const chargedLateCancels = lateCancelMap.get(cls.id) ?? 0;
    const rawBillable = attended + chargedNoShows + chargedLateCancels;
    // Billable seats can momentarily exceed capacity when a late-cancelled (and
    // forfeited) seat is rebooked — both the canceller and the new booking are
    // real revenue. Cap at capacity so a coach is credited for at most a full
    // room (avoids >100% occupancy, which would also miss any tier maxing at 100).
    const billableSeats =
      cls.room.maxCapacity > 0 ? Math.min(rawBillable, cls.room.maxCapacity) : rawBillable;
    const capped = cls.room.maxCapacity > 0 && rawBillable > cls.room.maxCapacity;
    const occupancyPct =
      cls.room.maxCapacity > 0
        ? Math.round((billableSeats / cls.room.maxCapacity) * 100)
        : 0;

    for (const rtype of PER_CLASS_TYPES) {
      let winner: Rate | null = null;
      for (const rate of payRates) {
        if (rate.type !== rtype || !rateMatchesClass(rate, cls)) continue;
        if (!winner || specificity(rate) > specificity(winner)) winner = rate;
      }
      if (!winner) continue;

      const mult = getMultiplier(winner, startsAt, cls.tag);
      let amount = 0;
      let rateLabel = "";

      if (rtype === "PER_CLASS") {
        amount = winner.amount * mult;
        rateLabel = `${winner.amount}/clase`;
      } else if (rtype === "PER_STUDENT") {
        amount = billableSeats * winner.amount * mult;
        rateLabel = `${winner.amount}/alumno × ${billableSeats}`;
      } else {
        const tiers =
          (winner.occupancyTiers as { min: number; max: number; amount: number }[] | null) ?? [];
        const metric = winner.tierBasis === "headcount" ? billableSeats : occupancyPct;
        const tier = tiers.find((t) => metric >= t.min && metric <= t.max);
        if (!tier) continue;
        amount = tier.amount * mult;
        rateLabel = `Tier ${tier.min}-${tier.max} → ${tier.amount}`;
      }

      classLines.push({
        classId: cls.id,
        startsAt,
        classTypeId: cls.classTypeId,
        classTypeName: cls.classType.name,
        classTypeColor: cls.classType.color,
        studioId: cls.room.studioId,
        studioName: cls.room.studio?.name ?? "",
        roomName: cls.room.name,
        capacity: cls.room.maxCapacity,
        attendees: billableSeats,
        attended,
        chargedNoShows,
        chargedLateCancels,
        capped,
        occupancyPct,
        rateType: rtype,
        rateLabel,
        multiplier: mult,
        amount: round2(amount),
        isPast,
      });

      total += amount;
      if (isPast) earnedSoFar += amount;
      else projected += amount;
      addBreakdown(rtype, amount);
    }
  }

  classLines.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return {
    total: round2(total),
    earnedSoFar: round2(earnedSoFar),
    projected: round2(projected),
    monthlyFixed: round2(monthlyFixed),
    breakdown: Array.from(breakdownMap.values()).map((b) => ({ ...b, amount: round2(b.amount) })),
    classLines,
    classesCount: classes.length,
    currency: payRates[0]?.currency ?? fallbackCurrencyCode,
    hasRates: true,
  };
}
