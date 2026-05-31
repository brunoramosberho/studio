import { describe, it, expect } from "vitest";
import { computeSpotsLeft } from "./availability";

describe("computeSpotsLeft", () => {
  it("subtracts every channel from physical capacity", () => {
    // 10-seat room: 3 Magic + 1 blocked + 4 Wellhub = 8 used → 2 left.
    expect(
      computeSpotsLeft({
        maxCapacity: 10,
        confirmedBookings: 3,
        blockedSpots: 1,
        platformBooked: 4,
      }),
    ).toBe(2);
  });

  it("counts platform bookings as occupied seats (the core fix)", () => {
    // Without counting platform bookings this would read 10 free seats and
    // oversell the room. With the fix: 10 − 0 − 0 − 4 = 6.
    expect(
      computeSpotsLeft({ maxCapacity: 10, confirmedBookings: 0, platformBooked: 4 }),
    ).toBe(6);
  });

  it("can go negative when the room is already oversold", () => {
    // 10 Magic + 4 Wellhub in a 10-seat room → −4 (signals oversell).
    expect(
      computeSpotsLeft({ maxCapacity: 10, confirmedBookings: 10, platformBooked: 4 }),
    ).toBe(-4);
  });

  it("defaults blocked and platform counts to zero", () => {
    expect(computeSpotsLeft({ maxCapacity: 8, confirmedBookings: 2 })).toBe(6);
  });

  it("returns full capacity for an empty class", () => {
    expect(
      computeSpotsLeft({ maxCapacity: 20, confirmedBookings: 0, blockedSpots: 0, platformBooked: 0 }),
    ).toBe(20);
  });
});
