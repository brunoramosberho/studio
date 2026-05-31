import { describe, it, expect } from "vitest";
import { evaluateReservationDecision } from "./decision";

const openQuota = (over: Partial<{ quotaSpots: number; bookedSpots: number; isClosedManually: boolean }> = {}) => ({
  quotaSpots: 4,
  bookedSpots: 0,
  isClosedManually: false,
  ...over,
});

describe("evaluateReservationDecision", () => {
  it("reserves when quota has room and the room has a physical seat", () => {
    const d = evaluateReservationDecision({ quota: openQuota(), physicalSpotsLeft: 5 });
    expect(d.status).toBe("RESERVED");
    expect(d.reason).toBeUndefined();
  });

  it("rejects when no quota is configured", () => {
    const d = evaluateReservationDecision({ quota: null, physicalSpotsLeft: 5 });
    expect(d).toEqual({ status: "REJECTED", reason: "CLASS_IS_FULL" });
  });

  it("rejects when quotaSpots is zero", () => {
    const d = evaluateReservationDecision({ quota: openQuota({ quotaSpots: 0 }), physicalSpotsLeft: 5 });
    expect(d).toEqual({ status: "REJECTED", reason: "CLASS_IS_FULL" });
  });

  it("rejects when the platform allocation is closed manually", () => {
    const d = evaluateReservationDecision({
      quota: openQuota({ isClosedManually: true }),
      physicalSpotsLeft: 5,
    });
    expect(d).toEqual({ status: "REJECTED", reason: "SPOT_NOT_AVAILABLE" });
  });

  it("rejects when the physical room is full even if quota has room (no oversell)", () => {
    const d = evaluateReservationDecision({
      quota: openQuota({ quotaSpots: 4, bookedSpots: 1 }),
      physicalSpotsLeft: 0,
    });
    expect(d).toEqual({ status: "REJECTED", reason: "CLASS_IS_FULL" });
  });

  it("rejects when the quota cap is reached even if the room has seats", () => {
    const d = evaluateReservationDecision({
      quota: openQuota({ quotaSpots: 4, bookedSpots: 4 }),
      physicalSpotsLeft: 10,
    });
    expect(d).toEqual({ status: "REJECTED", reason: "CLASS_IS_FULL" });
  });

  it("reserves the last quota slot when the room still has a seat", () => {
    const d = evaluateReservationDecision({
      quota: openQuota({ quotaSpots: 4, bookedSpots: 3 }),
      physicalSpotsLeft: 1,
    });
    expect(d.status).toBe("RESERVED");
  });

  it("treats negative physicalSpotsLeft (already oversold) as full", () => {
    const d = evaluateReservationDecision({
      quota: openQuota(),
      physicalSpotsLeft: -2,
    });
    expect(d).toEqual({ status: "REJECTED", reason: "CLASS_IS_FULL" });
  });

  it("closed flag takes priority over an available seat", () => {
    const d = evaluateReservationDecision({
      quota: openQuota({ isClosedManually: true, bookedSpots: 0 }),
      physicalSpotsLeft: 10,
    });
    expect(d.reason).toBe("SPOT_NOT_AVAILABLE");
  });
});
