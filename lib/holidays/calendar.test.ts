import { describe, it, expect } from "vitest";
import { nationalHolidays, holidayKey } from "./calendar";

describe("holidayKey", () => {
  it("formats a date as a UTC YYYY-MM-DD key", () => {
    expect(holidayKey(new Date("2026-04-03T10:30:00.000Z"))).toBe("2026-04-03");
    expect(holidayKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01-01");
  });
});

describe("nationalHolidays (ES)", () => {
  const es = nationalHolidays("ES", 2026);
  const dates = es.map((h) => h.date);

  it("includes the fixed national festivos", () => {
    expect(dates).toContain("2026-01-01"); // Año Nuevo
    expect(dates).toContain("2026-05-01"); // Trabajo
    expect(dates).toContain("2026-10-12"); // Fiesta Nacional
    expect(dates).toContain("2026-12-25"); // Navidad
  });

  it("computes Viernes Santo from Easter (Good Friday 2026 = Apr 3)", () => {
    expect(dates).toContain("2026-04-03");
  });

  it("is case-insensitive on the country code", () => {
    expect(nationalHolidays("es", 2026).length).toBe(es.length);
  });
});

describe("nationalHolidays (MX)", () => {
  const dates = nationalHolidays("MX", 2026).map((h) => h.date);

  it("computes movable Monday holidays", () => {
    expect(dates).toContain("2026-02-02"); // 1st Monday Feb — Constitución
    expect(dates).toContain("2026-03-16"); // 3rd Monday Mar — Benito Juárez
    expect(dates).toContain("2026-09-16"); // Independencia
  });
});

describe("nationalHolidays (unsupported)", () => {
  it("returns an empty list for unknown countries", () => {
    expect(nationalHolidays("FR", 2026)).toEqual([]);
    expect(nationalHolidays(null, 2026)).toEqual([]);
  });
});
