import { describe, expect, it } from "vitest";
import {
  allocateUnlimitedMonthly,
  dailyAccrualCents,
  daysInPeriodInclusive,
  lastDayOfMonth,
  monthBounds,
  packExpirationBreakageCents,
  perCreditCents,
} from "./math";
import type { BookingForAllocation } from "./types";

function booking(
  id: string,
  weight: number,
  capCents: number | null,
  hoursOffset = 0,
): BookingForAllocation {
  return {
    id,
    classId: `cls-${id}`,
    scheduledAt: new Date(2026, 0, 10, 10 + hoursOffset),
    weight,
    dropInPriceCents: capCents,
  };
}

describe("daysInPeriodInclusive", () => {
  it("counts Jan 15 → Feb 14 as 31 days", () => {
    const start = new Date(2026, 0, 15);
    const end = new Date(2026, 1, 14);
    expect(daysInPeriodInclusive(start, end)).toBe(31);
  });

  it("counts same day as 1 day", () => {
    const d = new Date(2026, 0, 10);
    expect(daysInPeriodInclusive(d, d)).toBe(1);
  });

  it("clamps to at least 1 day when end is before start", () => {
    const start = new Date(2026, 0, 10);
    const end = new Date(2026, 0, 5);
    expect(daysInPeriodInclusive(start, end)).toBe(1);
  });
});

describe("dailyAccrualCents", () => {
  it("floors to avoid over-recognition", () => {
    // 27000 cents / 31 days = 870.96... → floors to 870
    const start = new Date(2026, 0, 15);
    const end = new Date(2026, 1, 14);
    expect(dailyAccrualCents(27000, start, end)).toBe(870);
  });
});

describe("perCreditCents", () => {
  it("divides total by credits (floor)", () => {
    expect(perCreditCents(19500, 10)).toBe(1950);
    expect(perCreditCents(19500, 7)).toBe(2785); // 19500/7 = 2785.71
  });

  it("returns 0 for zero credits", () => {
    expect(perCreditCents(19500, 0)).toBe(0);
  });
});

describe("packExpirationBreakageCents", () => {
  it("AC #12: pack of 10 at €195, 5 used → 5 × €19.50 = €97.50", () => {
    expect(packExpirationBreakageCents(19500, 10, 5)).toBe(9750);
  });

  it("returns 0 when pack fully consumed", () => {
    expect(packExpirationBreakageCents(19500, 10, 10)).toBe(0);
  });

  it("clamps negative remaining to 0", () => {
    expect(packExpirationBreakageCents(19500, 10, 12)).toBe(0);
  });
});

describe("allocateUnlimitedMonthly — spec acceptance criteria", () => {
  it("AC #8: €270 unlimited, 1 standard class → €25 to class, €245 breakage", () => {
    const bucket = 27000;
    const bookings = [booking("b1", 1.0, 2500)];
    const result = allocateUnlimitedMonthly("ent1", bucket, bookings);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].amountCents).toBe(2500);
    expect(result.allocations[0].wasCapped).toBe(true);
    expect(result.monthlyBreakageCents).toBe(24500);
  });

  it("AC #9: €270 unlimited, 30 standard classes → €9 each, no breakage", () => {
    const bucket = 27000;
    const bookings = Array.from({ length: 30 }, (_, i) => booking(`b${i}`, 1.0, 2500));
    const result = allocateUnlimitedMonthly("ent1", bucket, bookings);
    expect(result.allocations).toHaveLength(30);
    expect(result.allocations.every((a) => a.amountCents === 900)).toBe(true);
    expect(result.allocations.every((a) => !a.wasCapped)).toBe(true);
    expect(result.monthlyBreakageCents).toBe(0);
  });

  it("AC #10: €270 unlimited, 0 classes → entire amount as breakage", () => {
    const result = allocateUnlimitedMonthly("ent1", 27000, []);
    expect(result.allocations).toHaveLength(0);
    expect(result.monthlyBreakageCents).toBe(27000);
  });

  it("AC #6: recovery (weight 1.8) gets more than standard (weight 1.0) in correct proportion", () => {
    const bucket = 2800; // small bucket so nothing caps
    const bookings = [booking("b1", 1.0, 10000), booking("b2", 1.8, 10000)];
    const result = allocateUnlimitedMonthly("ent1", bucket, bookings);
    const standard = result.allocations.find((a) => a.bookingId === "b1")!;
    const recovery = result.allocations.find((a) => a.bookingId === "b2")!;
    // Ratio should match weight ratio (up to floor rounding).
    expect(recovery.amountCents / standard.amountCents).toBeCloseTo(1.8, 1);
  });

  it("AC #7: caps every booking at drop-in price", () => {
    const bucket = 500000;
    const bookings = [booking("b1", 1.0, 2500), booking("b2", 1.8, 4500)];
    const result = allocateUnlimitedMonthly("ent1", bucket, bookings);
    for (const a of result.allocations) {
      const cap = bookings.find((b) => b.id === a.bookingId)!.dropInPriceCents!;
      expect(a.amountCents).toBeLessThanOrEqual(cap);
    }
  });

  it("zero weights → entire bucket as breakage", () => {
    const result = allocateUnlimitedMonthly("ent1", 27000, [booking("b1", 0, 2500)]);
    expect(result.allocations).toHaveLength(0);
    expect(result.monthlyBreakageCents).toBe(27000);
  });

  it("rounding residual becomes breakage (never over-recognized)", () => {
    // 100 cents across 3 weight-1 bookings: 33+33+33=99, 1 left over as breakage.
    const bookings = [booking("b1", 1, 10000), booking("b2", 1, 10000), booking("b3", 1, 10000)];
    const result = allocateUnlimitedMonthly("ent1", 100, bookings);
    const allocated = result.allocations.reduce((s, a) => s + a.amountCents, 0);
    expect(allocated).toBe(99);
    expect(result.monthlyBreakageCents).toBe(1);
    expect(allocated + result.monthlyBreakageCents).toBe(100);
  });

  it("bookings without drop-in cap are unconstrained", () => {
    const bucket = 10000;
    const bookings = [booking("b1", 1.0, null)];
    const result = allocateUnlimitedMonthly("ent1", bucket, bookings);
    expect(result.allocations[0].amountCents).toBe(10000);
    expect(result.monthlyBreakageCents).toBe(0);
  });
});

describe("lastDayOfMonth / monthBounds", () => {
  it("lastDayOfMonth returns last calendar day", () => {
    expect(lastDayOfMonth(new Date(2026, 0, 15)).getDate()).toBe(31);
    expect(lastDayOfMonth(new Date(2026, 1, 15)).getDate()).toBe(28); // 2026 not leap
  });

  it("monthBounds produces inclusive [start, end]", () => {
    const { start, end } = monthBounds("2026-03");
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(2);
    expect(end.getDate()).toBe(31);
    expect(end.getHours()).toBe(23);
  });
});
