// Pure liquidation math for platform settlements (Wellhub etc.). No I/O so it
// can be unit-tested exhaustively. Mirrors the partner's commercial contract:
//
//   - check-in            → full ratePerVisit
//   - no-show             → noShowFee (a FIXED amount, not a % of ratePerVisit)
//   - late cancellation   → lateCancelFee (a FIXED amount, not a %)
//   - free visits / month → first N paying events for a visitor earn 0
//   - per-visitor cap     → a single visitor can't earn the studio more than
//                           maxPayoutPerVisitor in one month
//
// The estimate is intentionally conservative and labelled an estimate — the
// source of truth for the actual payout is always the Wellhub dashboard.

export type SettlementEventType = "checkin" | "no_show" | "late_cancel";

export interface SettlementInput {
  /** Stable per-visitor id (Wellhub unique_token) for the cap + free-visit logic. */
  visitorId: string;
  type: SettlementEventType;
}

export interface SettlementConditions {
  ratePerVisit: number;
  /** Fixed amount paid for a no-show (not a fraction of ratePerVisit). */
  noShowFee: number;
  /** Fixed amount paid for a late cancellation (not a fraction). */
  lateCancelFee: number;
  /** Max the studio can earn from one visitor in the month (0/undefined = no cap). */
  maxPayoutPerVisitor?: number | null;
  /** Visits that earn nothing per visitor per month (trial). */
  freeVisitsPerMonth?: number | null;
}

export interface SettlementResult {
  total: number;
  payableCheckins: number;
  payableNoShows: number;
  payableLateCancels: number;
  freeVisitsApplied: number;
  cappedVisitors: number;
}

/** Per-event gross amount before free-visit / cap adjustments. */
function grossFor(type: SettlementEventType, c: SettlementConditions): number {
  switch (type) {
    case "checkin":
      return c.ratePerVisit;
    case "no_show":
      return c.noShowFee ?? 0;
    case "late_cancel":
      return c.lateCancelFee ?? 0;
  }
}

/**
 * Compute the month's estimated payout across a flat list of paid events.
 * Free visits consume the cheapest-to-the-studio events first (best case for
 * the studio is debatable; we apply free visits to the EARLIEST events per
 * visitor, which matches "first N visits are free" contract wording).
 */
export function computeSettlement(
  events: SettlementInput[],
  c: SettlementConditions,
): SettlementResult {
  const freeQuota = Math.max(0, Math.floor(c.freeVisitsPerMonth ?? 0));
  const cap = c.maxPayoutPerVisitor && c.maxPayoutPerVisitor > 0 ? c.maxPayoutPerVisitor : Infinity;

  // Group events per visitor, preserving input order (chronological by caller).
  const byVisitor = new Map<string, SettlementEventType[]>();
  for (const e of events) {
    const arr = byVisitor.get(e.visitorId) ?? [];
    arr.push(e.type);
    byVisitor.set(e.visitorId, arr);
  }

  const result: SettlementResult = {
    total: 0,
    payableCheckins: 0,
    payableNoShows: 0,
    payableLateCancels: 0,
    freeVisitsApplied: 0,
    cappedVisitors: 0,
  };

  for (const [, types] of byVisitor) {
    let visitorTotal = 0;
    let freeRemaining = freeQuota;
    let wasCapped = false;

    for (const type of types) {
      // Free visits zero out the earliest events for this visitor.
      if (freeRemaining > 0) {
        freeRemaining--;
        result.freeVisitsApplied++;
        continue;
      }

      const gross = grossFor(type, c);
      const room = cap - visitorTotal;
      if (room <= 0) {
        wasCapped = true;
        continue;
      }
      const paid = Math.min(gross, room);
      if (paid < gross) wasCapped = true;
      visitorTotal += paid;

      // Count payable events by type (count the event even if partially capped).
      if (paid > 0) {
        if (type === "checkin") result.payableCheckins++;
        else if (type === "no_show") result.payableNoShows++;
        else result.payableLateCancels++;
      }
    }

    if (wasCapped) result.cappedVisitors++;
    result.total += visitorTotal;
  }

  // Round to cents to avoid float dust.
  result.total = Math.round(result.total * 100) / 100;
  return result;
}
