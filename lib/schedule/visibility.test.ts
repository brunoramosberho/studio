import { describe, expect, it } from "vitest";
import { computeVisibleUntil, type ScheduleVisibilityFields } from "./visibility";
import { getWallClockInZone, zonedWallTimeToUtc } from "@/lib/utils";

const MADRID = "Europe/Madrid";
const CDMX = "America/Mexico_City";

function rolling(days: number): ScheduleVisibilityFields {
  return {
    scheduleVisibilityMode: "ROLLING_DAYS",
    visibleScheduleDays: days,
    scheduleReleaseDayOfWeek: null,
    scheduleReleaseHour: null,
    scheduleReleaseWeeksAhead: null,
    scheduleReleaseTimezone: null,
  };
}

function weekly(dow: number, hour: number, weeksAhead: number): ScheduleVisibilityFields {
  return {
    scheduleVisibilityMode: "WEEKLY_RELEASE",
    visibleScheduleDays: 7,
    scheduleReleaseDayOfWeek: dow,
    scheduleReleaseHour: hour,
    scheduleReleaseWeeksAhead: weeksAhead,
    scheduleReleaseTimezone: null,
  };
}

function at(year: number, month: number, day: number, hour: number, minute = 0, tz = MADRID): Date {
  return zonedWallTimeToUtc(year, month - 1, day, hour, minute, tz);
}

describe("computeVisibleUntil — ROLLING_DAYS", () => {
  it("7 days from a Wednesday lands on the following Tuesday end-of-day", () => {
    // Wed 2026-03-04 12:00 Madrid → visible until end of 2026-03-10
    const now = at(2026, 3, 4, 12);
    const end = computeVisibleUntil(now, rolling(7), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    expect(wc.year).toBe(2026);
    expect(wc.month).toBe(3);
    expect(wc.day).toBe(10);
    expect(wc.hour).toBe(23);
    expect(wc.minute).toBe(59);
  });

  it("1 day means just today, end-of-day", () => {
    const now = at(2026, 3, 4, 12);
    const end = computeVisibleUntil(now, rolling(1), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    expect(wc.day).toBe(4);
    expect(wc.hour).toBe(23);
  });

  it("respects the provided timezone over the system tz", () => {
    // Same UTC instant resolves to different "today" in Madrid vs CDMX.
    const now = new Date("2026-03-04T01:00:00Z"); // Madrid = 02:00 Wed, CDMX = 19:00 Tue
    const endMadrid = computeVisibleUntil(now, rolling(1), MADRID);
    const endCdmx = computeVisibleUntil(now, rolling(1), CDMX);
    expect(getWallClockInZone(endMadrid, MADRID).day).toBe(4);
    expect(getWallClockInZone(endCdmx, CDMX).day).toBe(3);
  });
});

describe("computeVisibleUntil — WEEKLY_RELEASE", () => {
  // Reference week: Mon 2026-03-02 .. Sun 2026-03-08 (ISO week 10).
  // Release config: every Sunday (dow=0) at 22:00, weeksAhead=1.

  it("just before Sunday release: visible only through end of current ISO week", () => {
    // Sun 2026-03-08 21:00 Madrid (1h before release)
    const now = at(2026, 3, 8, 21);
    const end = computeVisibleUntil(now, weekly(0, 22, 1), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    // Last release was Sun 2026-03-01 22:00, week ends Sun 2026-03-01,
    // +1*7 = Sun 2026-03-08 23:59.
    expect(wc.year).toBe(2026);
    expect(wc.month).toBe(3);
    expect(wc.day).toBe(8);
    expect(wc.hour).toBe(23);
  });

  it("right after Sunday release: visible through end of next ISO week", () => {
    // Sun 2026-03-08 22:00 (release fires)
    const now = at(2026, 3, 8, 22);
    const end = computeVisibleUntil(now, weekly(0, 22, 1), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    // L = Sun 2026-03-08 22:00, endOfWeek = Sun 2026-03-08, +7 = Sun 2026-03-15.
    expect(wc.day).toBe(15);
    expect(wc.month).toBe(3);
  });

  it("mid-week after release contracts back to one week ahead", () => {
    // Tue 2026-03-10 12:00 (current week is 2026-03-09..15)
    const now = at(2026, 3, 10, 12);
    const end = computeVisibleUntil(now, weekly(0, 22, 1), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    // L = Sun 2026-03-08 22:00 → visible until Sun 2026-03-15.
    expect(wc.day).toBe(15);
    expect(wc.month).toBe(3);
  });

  it("weeksAhead=2 keeps two weeks visible mid-week", () => {
    // Tue 2026-03-10 12:00, weeksAhead=2
    const now = at(2026, 3, 10, 12);
    const end = computeVisibleUntil(now, weekly(0, 22, 2), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    // L = Sun 2026-03-08 22:00, +14 days = Sun 2026-03-22.
    expect(wc.day).toBe(22);
    expect(wc.month).toBe(3);
  });

  it("weeksAhead=2 right after release shows three weeks (current + 2 ahead)", () => {
    const now = at(2026, 3, 8, 22, 5); // 5 min after release
    const end = computeVisibleUntil(now, weekly(0, 22, 2), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    // L = Sun 2026-03-08 22:00, +14 days = Sun 2026-03-22.
    expect(wc.day).toBe(22);
    expect(wc.month).toBe(3);
  });

  it("Wed 22:00 release with weeksAhead=1 releases mid-week but spans the next ISO week", () => {
    // Thu 2026-03-12 10:00 — last release was Wed 2026-03-11 22:00.
    const now = at(2026, 3, 12, 10);
    const end = computeVisibleUntil(now, weekly(3, 22, 1), MADRID);
    const wc = getWallClockInZone(end, MADRID);
    // L = Wed 2026-03-11 22:00, endOfWeek = Sun 2026-03-15, +7 = Sun 2026-03-22.
    expect(wc.day).toBe(22);
    expect(wc.month).toBe(3);
  });

  it("falls back to rolling when weekly-release fields are missing", () => {
    const tenant: ScheduleVisibilityFields = {
      scheduleVisibilityMode: "WEEKLY_RELEASE",
      visibleScheduleDays: 7,
      scheduleReleaseDayOfWeek: null,
      scheduleReleaseHour: null,
      scheduleReleaseWeeksAhead: null,
      scheduleReleaseTimezone: null,
    };
    const now = at(2026, 3, 4, 12);
    const end = computeVisibleUntil(now, tenant, MADRID);
    const wc = getWallClockInZone(end, MADRID);
    expect(wc.day).toBe(10); // same as rolling(7)
  });

  it("respects DST: 02:00 release on the spring-forward day still resolves", () => {
    // EU DST: clocks jump 2026-03-29 from 02:00 to 03:00 (Madrid).
    // Release config: Sunday 02:00 — at the very moment that doesn't exist.
    // We just assert the call doesn't throw and produces a sane date.
    const now = at(2026, 3, 29, 12); // noon on the DST day
    const end = computeVisibleUntil(now, weekly(0, 2, 1), MADRID);
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });
});
