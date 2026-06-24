import { describe, it, expect } from "vitest";
import { computeSettlement, type SettlementInput } from "./liquidation-math";

// Be Toro's real Wellhub contract.
const betoro = {
  ratePerVisit: 15,
  noShowPercent: 0.7,
  lateCancelPercent: 0.7,
  maxPayoutPerVisitor: 150,
  freeVisitsPerMonth: 0,
};

const ev = (visitorId: string, type: SettlementInput["type"]): SettlementInput => ({
  visitorId,
  type,
});

describe("computeSettlement", () => {
  it("pays full rate per check-in", () => {
    const r = computeSettlement(
      [ev("u1", "checkin"), ev("u2", "checkin"), ev("u3", "checkin")],
      betoro,
    );
    expect(r.total).toBe(45);
    expect(r.payableCheckins).toBe(3);
  });

  it("pays no-show and late-cancel at the configured percentage", () => {
    const r = computeSettlement([ev("u1", "no_show"), ev("u2", "late_cancel")], betoro);
    // 15 * 0.7 = 10.5 each
    expect(r.total).toBe(21);
    expect(r.payableNoShows).toBe(1);
    expect(r.payableLateCancels).toBe(1);
  });

  it("caps a single visitor at maxPayoutPerVisitor per month", () => {
    // 11 check-ins for the same visitor = 165 gross, capped at 150.
    const events = Array.from({ length: 11 }, () => ev("u1", "checkin"));
    const r = computeSettlement(events, betoro);
    expect(r.total).toBe(150);
    expect(r.cappedVisitors).toBe(1);
  });

  it("applies the cap per visitor, not globally", () => {
    const events = [
      ...Array.from({ length: 11 }, () => ev("u1", "checkin")), // capped at 150
      ...Array.from({ length: 11 }, () => ev("u2", "checkin")), // capped at 150
    ];
    const r = computeSettlement(events, betoro);
    expect(r.total).toBe(300);
    expect(r.cappedVisitors).toBe(2);
  });

  it("zeroes out free visits per visitor", () => {
    const withFree = { ...betoro, freeVisitsPerMonth: 1 };
    // u1: first visit free, second paid (15). u2: only one visit, free.
    const r = computeSettlement(
      [ev("u1", "checkin"), ev("u1", "checkin"), ev("u2", "checkin")],
      withFree,
    );
    expect(r.total).toBe(15);
    expect(r.freeVisitsApplied).toBe(2);
    expect(r.payableCheckins).toBe(1);
  });

  it("handles a partial cap on the last event", () => {
    // 9 check-ins = 135, 10th check-in only 15 of room left (150-135) → exact.
    // 11th would be over: 10 check-ins = 150 exactly, 11th capped to 0.
    const events = Array.from({ length: 11 }, () => ev("u1", "checkin"));
    const r = computeSettlement(events, betoro);
    expect(r.total).toBe(150);
    // 10 fully payable, 11th contributes 0 → not counted as payable.
    expect(r.payableCheckins).toBe(10);
  });

  it("returns zero for an empty month", () => {
    const r = computeSettlement([], betoro);
    expect(r.total).toBe(0);
    expect(r.cappedVisitors).toBe(0);
  });

  it("treats no cap (null) as unlimited", () => {
    const noCap = { ...betoro, maxPayoutPerVisitor: null };
    const events = Array.from({ length: 20 }, () => ev("u1", "checkin"));
    const r = computeSettlement(events, noCap);
    expect(r.total).toBe(300);
    expect(r.cappedVisitors).toBe(0);
  });
});
