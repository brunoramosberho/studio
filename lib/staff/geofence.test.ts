import { describe, expect, it } from "vitest";
import { haversineDistance } from "./geofence";

describe("haversineDistance", () => {
  it("returns 0 for the same point", () => {
    const p = { latitude: 19.4326, longitude: -99.1332 };
    expect(haversineDistance(p, p)).toBe(0);
  });

  it("approximates known short distances within 1%", () => {
    // Roughly 1km north/south: 0.009 degrees latitude.
    const a = { latitude: 19.4326, longitude: -99.1332 };
    const b = { latitude: 19.4416, longitude: -99.1332 };
    const d = haversineDistance(a, b);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });

  it("approximates a longer distance (Mexico City → Polanco ~5km) within 5%", () => {
    const a = { latitude: 19.4326, longitude: -99.1332 }; // Zócalo
    const b = { latitude: 19.4338, longitude: -99.1903 }; // Polanco
    const d = haversineDistance(a, b);
    expect(d).toBeGreaterThan(5800);
    expect(d).toBeLessThan(6500);
  });

  it("is symmetric", () => {
    const a = { latitude: 19.0, longitude: -99.0 };
    const b = { latitude: 20.0, longitude: -100.0 };
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6);
  });
});
