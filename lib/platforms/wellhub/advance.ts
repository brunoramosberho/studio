// Wellhub payment advance (factoring) — domain logic.
//
// Studios with the Wellhub API integration + advance access can draw the
// settlement value of the period's ALREADY-ACCRUED billable events (check-ins,
// no-shows, late-cancels) before Wellhub's ~15th payout. Window: the 20th of
// the month through the 7th of the next month (studio-local):
//   • 20th → end of month: draws against the CURRENT month's events so far.
//   • 1st → 7th:           draws against the PREVIOUS (closed) month.
//
// Money: gross = computeSettlement(period events) − already-drawn gross, so
// per-visitor caps / free visits are respected incrementally. Magic withholds
// fee% (+VAT on the fee); net is what's transferred. Amounts are integer cents
// snapshotted on the WellhubAdvance row; covered events are marked via
// PlatformBooking.advanceId (double-advance guard + audit trail).
//
// v1 moves money manually: super-admin approves → transfers → marks paid, and
// on Wellhub's payout settles the period (remainder = settlement total − drawn
// gross, passed through with no fee).

import { prisma } from "@/lib/db";
import { computeSettlement, type SettlementInput } from "../liquidation-math";

// Draw window (studio-local day of month).
const WINDOW_OPEN_DAY = 20; // from the 20th…
const WINDOW_CLOSE_DAY = 7; // …through the 7th of the next month.

// Statuses that keep a draw's gross "consumed" (rejected/cancelled release it).
export const ACTIVE_ADVANCE_STATUSES = ["requested", "approved", "paid", "settled"] as const;

export interface AdvanceWindow {
  open: boolean;
  /** Settlement period a draw would cover, "YYYY-MM" (studio-local). */
  period: string;
  /** UTC instants bounding the period. */
  periodStart: Date;
  periodEnd: Date;
  /** Studio-local day of month for `now` (for display copy). */
  localDay: number;
}

export interface AdvanceAvailability {
  counts: { checkins: number; noShows: number; lateCancels: number };
  /** Settlement value of the period so far (cents). */
  periodGrossCents: number;
  /** Gross already consumed by active draws this period (cents). */
  drawnGrossCents: number;
  /** What a draw right now would advance (cents). */
  grossCents: number;
  feeCents: number;
  vatCents: number;
  netCents: number;
  feePercent: number;
  vatPercent: number;
  /** Ids of the not-yet-covered billable PlatformBookings. */
  eventIds: string[];
}

// ── Time helpers (Intl-based; no extra deps) ────────────────────────────────

function zonedParts(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** UTC instant of local midnight on (y, m, d) in `timeZone`. */
function zonedMidnightUtc(y: number, m: number, d: number, timeZone: string): Date {
  // Guess UTC midnight, then correct by the zone's wall-clock difference.
  let guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    const target = Date.UTC(y, m - 1, d, 0, 0);
    const diff = target - wall;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

export function getAdvanceWindow(now: Date, timeZone: string): AdvanceWindow {
  const { y, m, d } = zonedParts(now, timeZone);

  // Which period would a draw cover?
  let py = y;
  let pm = m;
  if (d <= WINDOW_CLOSE_DAY) {
    // Early month → previous (closed) period.
    pm = m === 1 ? 12 : m - 1;
    py = m === 1 ? y - 1 : y;
  }
  const open = d >= WINDOW_OPEN_DAY || d <= WINDOW_CLOSE_DAY;

  const periodStart = zonedMidnightUtc(py, pm, 1, timeZone);
  const nextM = pm === 12 ? 1 : pm + 1;
  const nextY = pm === 12 ? py + 1 : py;
  const periodEnd = zonedMidnightUtc(nextY, nextM, 1, timeZone);

  return {
    open,
    period: `${py}-${String(pm).padStart(2, "0")}`,
    periodStart,
    periodEnd,
    localDay: d,
  };
}

// ── Availability ────────────────────────────────────────────────────────────

/**
 * Billable Wellhub events of the period, chronological (settlement math needs
 * per-visitor order), with coverage state. Bucketing is by class start — the
 * same rule as lib/platforms/settlement.ts, so the advance always reconciles
 * with the Settlement tab.
 */
async function loadPeriodEvents(tenantId: string, w: AdvanceWindow) {
  return prisma.platformBooking.findMany({
    where: {
      tenantId,
      platform: "wellhub",
      class: { startsAt: { gte: w.periodStart, lt: w.periodEnd } },
      OR: [
        { status: { in: ["checked_in", "absent"] } },
        { status: "cancelled", notes: "wellhub_late_cancel" },
      ],
    },
    select: {
      id: true,
      status: true,
      wellhubUserUniqueToken: true,
      advanceId: true,
      class: { select: { startsAt: true } },
    },
    orderBy: { class: { startsAt: "asc" } },
  });
}

function toSettlementInputs(
  events: Awaited<ReturnType<typeof loadPeriodEvents>>,
): SettlementInput[] {
  return events.map((e) => ({
    visitorId: e.wellhubUserUniqueToken ?? `booking:${e.id}`,
    type:
      e.status === "checked_in" ? "checkin" : e.status === "absent" ? "no_show" : "late_cancel",
  }));
}

export async function getAdvanceAvailability(
  tenantId: string,
  w: AdvanceWindow,
): Promise<AdvanceAvailability | null> {
  const [config, platformCfg, priorDraws] = await Promise.all([
    prisma.wellhubAdvanceConfig.findUnique({ where: { tenantId } }),
    prisma.studioPlatformConfig.findFirst({
      where: { tenantId, platform: "wellhub", isActive: true },
      select: {
        ratePerVisit: true,
        noShowFee: true,
        lateCancelFee: true,
        maxPayoutPerVisitor: true,
        freeVisitsPerMonth: true,
      },
    }),
    prisma.wellhubAdvance.aggregate({
      where: {
        tenantId,
        period: w.period,
        status: { in: [...ACTIVE_ADVANCE_STATUSES] },
      },
      _sum: { grossCents: true },
    }),
  ]);
  if (!platformCfg) return null;

  const feePercent = config?.feePercent ?? 2.35;
  const vatPercent = config?.vatPercent ?? 16;

  const events = await loadPeriodEvents(tenantId, w);
  const settlement = computeSettlement(toSettlementInputs(events), {
    ratePerVisit: platformCfg.ratePerVisit ?? 0,
    noShowFee: platformCfg.noShowFee ?? 0,
    lateCancelFee: platformCfg.lateCancelFee ?? 0,
    maxPayoutPerVisitor: platformCfg.maxPayoutPerVisitor ?? null,
    freeVisitsPerMonth: platformCfg.freeVisitsPerMonth ?? null,
  });

  const periodGrossCents = Math.round(settlement.total * 100);
  const drawnGrossCents = priorDraws._sum.grossCents ?? 0;
  const grossCents = Math.max(0, periodGrossCents - drawnGrossCents);
  const feeCents = Math.round((grossCents * feePercent) / 100);
  const vatCents = Math.round((feeCents * vatPercent) / 100);
  const netCents = grossCents - feeCents - vatCents;

  const uncovered = events.filter((e) => !e.advanceId);
  const counts = {
    checkins: uncovered.filter((e) => e.status === "checked_in").length,
    noShows: uncovered.filter((e) => e.status === "absent").length,
    lateCancels: uncovered.filter((e) => e.status === "cancelled").length,
  };

  return {
    counts,
    periodGrossCents,
    drawnGrossCents,
    grossCents,
    feeCents,
    vatCents,
    netCents,
    feePercent,
    vatPercent,
    eventIds: uncovered.map((e) => e.id),
  };
}

// ── Draw ────────────────────────────────────────────────────────────────────

export class AdvanceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function createAdvanceDraw(args: {
  tenantId: string;
  timeZone: string;
  currency: string;
  requestedBy?: string | null;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const w = getAdvanceWindow(now, args.timeZone);
  if (!w.open) {
    throw new AdvanceError(
      "window_closed",
      `La ventana de adelanto abre el día ${WINDOW_OPEN_DAY} y cierra el día ${WINDOW_CLOSE_DAY} del mes siguiente.`,
    );
  }

  const config = await prisma.wellhubAdvanceConfig.findUnique({
    where: { tenantId: args.tenantId },
  });
  if (config?.access !== "enabled") {
    throw new AdvanceError("not_enabled", "El adelanto de pagos no está habilitado para este estudio.");
  }

  const availability = await getAdvanceAvailability(args.tenantId, w);
  if (!availability) {
    throw new AdvanceError("no_wellhub", "Wellhub no está activo para este estudio.");
  }
  if (availability.grossCents <= 0 || availability.eventIds.length === 0) {
    throw new AdvanceError("nothing_to_advance", "No hay eventos nuevos por adelantar en este periodo.");
  }

  return prisma.$transaction(async (tx) => {
    const advance = await tx.wellhubAdvance.create({
      data: {
        tenantId: args.tenantId,
        period: w.period,
        status: "requested",
        checkins: availability.counts.checkins,
        noShows: availability.counts.noShows,
        lateCancels: availability.counts.lateCancels,
        grossCents: availability.grossCents,
        feeCents: availability.feeCents,
        vatCents: availability.vatCents,
        netCents: availability.netCents,
        feePercent: availability.feePercent,
        vatPercent: availability.vatPercent,
        currency: args.currency,
        requestedBy: args.requestedBy ?? null,
      },
    });

    // Mark the covered events. The advanceId:null guard makes a concurrent
    // double-draw benign: the second one marks 0 rows and is rolled back.
    const marked = await tx.platformBooking.updateMany({
      where: { id: { in: availability.eventIds }, advanceId: null },
      data: { advanceId: advance.id },
    });
    if (marked.count === 0) {
      throw new AdvanceError("nothing_to_advance", "Los eventos ya fueron adelantados en otra solicitud.");
    }

    return advance;
  });
}

/** Release a rejected/cancelled draw's events so a future draw can cover them. */
export async function releaseAdvanceEvents(advanceId: string) {
  await prisma.platformBooking.updateMany({
    where: { advanceId },
    data: { advanceId: null },
  });
}
