import { describe, expect, it } from "vitest";
import {
  bookingClauses,
  isFree,
  policyClauses,
  sameConsequence,
  type NoticePolicy,
} from "./notice";

const base: NoticePolicy = {
  cancellationWindowHours: 12,
  noShowPenaltyEnabled: false,
  noShowLoseCredit: true,
  noShowChargeFee: false,
  noShowPenaltyAmount: null,
  noShowFeeAmountUnlimited: null,
};

describe("policyClauses — the studio's general policy", () => {
  it("still forfeits the credit when penalties are switched off", () => {
    // The credit was spent when the booking was made and the legacy path keeps
    // it spent. Reading the master switch as "no consequence" would mislead
    // exactly the members who lose something.
    const c = policyClauses(base);
    expect(c.noShow).toEqual({ losesCredit: true, fee: null, feeVaries: false });
    expect(c.lateCancel.losesCredit).toBe(true);
  });

  it("keeps the no-show fee off the late cancel", () => {
    // FDV: $200 on a no-show, but cancelling late only costs the credit.
    // Charging both in the same sentence overstates every late cancel.
    const c = policyClauses({
      ...base,
      noShowPenaltyEnabled: true,
      noShowChargeFee: true,
      noShowPenaltyAmount: 200,
    });
    expect(c.noShow.fee).toBe(200);
    expect(c.lateCancel.fee).toBeNull();
    expect(sameConsequence(c.lateCancel, c.noShow)).toBe(false);
  });

  it("hedges the no-show fee when packs and unlimited pay differently", () => {
    // Betoro: packs pay nothing, unlimited pays €15. Naming either number
    // alone is wrong for half the members.
    const c = policyClauses({
      ...base,
      noShowPenaltyEnabled: true,
      noShowChargeFee: true,
      noShowPenaltyAmount: 0,
      noShowFeeAmountUnlimited: 15,
    });
    expect(c.noShow.fee).toBe(15);
    expect(c.noShow.feeVaries).toBe(true);
  });

  it("falls back to the pack amount for unlimited when none is set", () => {
    const c = policyClauses({
      ...base,
      noShowPenaltyEnabled: true,
      noShowChargeFee: true,
      noShowPenaltyAmount: 30,
    });
    expect(c.noShow.fee).toBe(30);
    expect(c.noShow.feeVaries).toBe(false);
  });

  it("treats a zero fee as no fee, and ignores amounts when charging is off", () => {
    expect(
      policyClauses({
        ...base,
        noShowPenaltyEnabled: true,
        noShowChargeFee: true,
        noShowPenaltyAmount: 0,
        noShowFeeAmountUnlimited: 0,
      }).noShow.fee,
    ).toBeNull();

    expect(
      policyClauses({
        ...base,
        noShowPenaltyEnabled: true,
        noShowChargeFee: false,
        noShowPenaltyAmount: 200,
        noShowFeeAmountUnlimited: 500,
      }).noShow.fee,
    ).toBeNull();
  });

  it("always hedges a late-cancel fee, because only unlimited plans carry one", () => {
    // FDV Unlimited charges $100 to cancel late; pack members pay nothing.
    const c = policyClauses({ ...base, maxLateCancelFee: 100 });
    expect(c.lateCancel.fee).toBe(100);
    expect(c.lateCancel.feeVaries).toBe(true);
  });

  it("normalises a missing or fractional window", () => {
    expect(policyClauses({ ...base, cancellationWindowHours: -5 }).windowHours).toBe(0);
    expect(policyClauses({ ...base, cancellationWindowHours: 2.6 }).windowHours).toBe(3);
  });
});

describe("bookingClauses — one member's actual booking", () => {
  it("never hedges: the plan is already known", () => {
    const c = bookingClauses({
      windowHours: 12,
      isUnlimited: true,
      lateCancelFee: 100,
      noShowLosesCredit: false,
      noShowFee: 200,
    });
    expect(c.lateCancel).toEqual({ losesCredit: false, fee: 100, feeVaries: false });
    expect(c.noShow).toEqual({ losesCredit: false, fee: 200, feeVaries: false });
  });

  it("charges an unlimited member rather than taking a credit they don't have", () => {
    const c = bookingClauses({
      windowHours: 12,
      isUnlimited: true,
      lateCancelFee: 100,
      noShowLosesCredit: true, // tenant flag says yes, but there is no credit
      noShowFee: 0,
    });
    expect(c.lateCancel.losesCredit).toBe(false);
    expect(c.lateCancel.fee).toBe(100);
  });

  it("takes the credit from a pack member and charges nothing to cancel late", () => {
    // The booking API zeroes lateCancelFee for pack bookings; this is the
    // shape that reaches the email.
    const c = bookingClauses({
      windowHours: 24,
      isUnlimited: false,
      lateCancelFee: 0,
      noShowLosesCredit: true,
      noShowFee: 200,
    });
    expect(c.windowHours).toBe(24);
    expect(c.lateCancel).toEqual({ losesCredit: true, fee: null, feeVaries: false });
    expect(c.noShow).toEqual({ losesCredit: true, fee: 200, feeVaries: false });
    expect(sameConsequence(c.lateCancel, c.noShow)).toBe(false);
  });

  it("collapses to one sentence when both events cost the same", () => {
    const c = bookingClauses({
      windowHours: 12,
      isUnlimited: false,
      lateCancelFee: 0,
      noShowLosesCredit: true,
      noShowFee: 0,
    });
    expect(sameConsequence(c.lateCancel, c.noShow)).toBe(true);
    expect(isFree(c.lateCancel)).toBe(false);
  });

  it("recognises a booking with no penalty at all", () => {
    const c = bookingClauses({
      windowHours: 12,
      isUnlimited: true,
      lateCancelFee: 0,
      noShowLosesCredit: true,
      noShowFee: 0,
    });
    expect(isFree(c.lateCancel)).toBe(true);
    expect(isFree(c.noShow)).toBe(true);
    expect(sameConsequence(c.lateCancel, c.noShow)).toBe(true);
  });
});
