import { prisma } from "@/lib/db";
import {
  computeSettlement,
  type SettlementInput,
  type SettlementEventType,
} from "./liquidation-math";

export interface PlatformSettlementSummary {
  /** Estimated platform payout for the range (Wellhub etc.). */
  total: number;
  /** Paid check-ins counted (the bulk of the estimate). */
  checkins: number;
  byPlatform: { platform: string; total: number; checkins: number }[];
}

const EMPTY: PlatformSettlementSummary = { total: 0, checkins: 0, byPlatform: [] };

function classify(status: string): SettlementEventType {
  if (status === "checked_in") return "checkin";
  if (status === "absent") return "no_show";
  return "late_cancel";
}

/**
 * Estimated platform settlement (Wellhub etc.) for [start, end). Mirrors the
 * /api/platforms/liquidation math (full ratePerVisit per check-in, a fraction
 * for no-shows / late cancellations, with the monthly free visits + per-visitor
 * cap from each platform's commercial config). Events are grouped per calendar
 * month so the monthly cap applies correctly across multi-month ranges.
 *
 * This is an ESTIMATE (the source of truth is the partner dashboard) and is
 * display-only — it must never be written into the RevenueEvent ledger.
 */
export async function getPlatformSettlementForRange(
  tenantId: string,
  start: Date,
  end: Date,
): Promise<PlatformSettlementSummary> {
  const configs = await prisma.studioPlatformConfig.findMany({
    where: { tenantId, isActive: true },
    select: {
      platform: true,
      ratePerVisit: true,
      maxPayoutPerVisitor: true,
      noShowFee: true,
      lateCancelFee: true,
      freeVisitsPerMonth: true,
    },
  });
  if (configs.length === 0) return EMPTY;
  const cfgByPlatform = new Map(configs.map((c) => [c.platform as string, c]));

  const bookings = await prisma.platformBooking.findMany({
    where: {
      tenantId,
      platform: { in: configs.map((c) => c.platform) },
      class: { startsAt: { gte: start, lt: end } },
      OR: [
        { status: { in: ["checked_in", "absent"] } },
        { status: "cancelled", notes: "wellhub_late_cancel" },
      ],
    },
    select: {
      id: true,
      platform: true,
      status: true,
      wellhubUserUniqueToken: true,
      class: { select: { startsAt: true } },
    },
    orderBy: { class: { startsAt: "asc" } },
  });
  if (bookings.length === 0) return EMPTY;

  // Group events by (platform, calendar month) so the per-visitor monthly cap
  // is evaluated within a single month, even for multi-month ranges.
  const groups = new Map<string, { platform: string; events: SettlementInput[] }>();
  for (const b of bookings) {
    const d = b.class.startsAt;
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    const key = `${b.platform}|${monthKey}`;
    const bucket = groups.get(key) ?? { platform: b.platform, events: [] };
    bucket.events.push({
      visitorId: b.wellhubUserUniqueToken ?? `booking:${b.id}`,
      type: classify(b.status),
    });
    groups.set(key, bucket);
  }

  const byPlatformTotals = new Map<string, { total: number; checkins: number }>();
  for (const { platform, events } of groups.values()) {
    const cfg = cfgByPlatform.get(platform);
    const s = computeSettlement(events, {
      ratePerVisit: cfg?.ratePerVisit ?? 0,
      noShowFee: cfg?.noShowFee ?? 0,
      lateCancelFee: cfg?.lateCancelFee ?? 0,
      maxPayoutPerVisitor: cfg?.maxPayoutPerVisitor ?? null,
      freeVisitsPerMonth: cfg?.freeVisitsPerMonth ?? null,
    });
    const cur = byPlatformTotals.get(platform) ?? { total: 0, checkins: 0 };
    cur.total += s.total;
    cur.checkins += s.payableCheckins;
    byPlatformTotals.set(platform, cur);
  }

  const byPlatform = [...byPlatformTotals.entries()].map(([platform, v]) => ({
    platform,
    total: Math.round(v.total * 100) / 100,
    checkins: v.checkins,
  }));
  const total = Math.round(byPlatform.reduce((s, p) => s + p.total, 0) * 100) / 100;
  const checkins = byPlatform.reduce((s, p) => s + p.checkins, 0);
  return { total, checkins, byPlatform };
}
