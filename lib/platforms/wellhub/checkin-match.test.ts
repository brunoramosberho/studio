import { describe, it, expect } from "vitest";
import { pickClosestClass, type ClassCandidate } from "./checkin-match";

// Helper: a class on 2026-06-26 with HH:MM start and length minutes.
const cls = (id: string, start: string, lengthMin = 50): ClassCandidate => {
  const startsAt = new Date(`2026-06-26T${start}:00Z`);
  return { id, startsAt, endsAt: new Date(startsAt.getTime() + lengthMin * 60_000) };
};
const at = (hhmm: string) => new Date(`2026-06-26T${hhmm}:00Z`);

describe("pickClosestClass", () => {
  it("returns no_candidates for an empty list", () => {
    const r = pickClosestClass([], at("10:00"));
    expect(r.match).toBeNull();
    expect(r.reason).toBe("no_candidates");
  });

  it("matches a class in progress", () => {
    const r = pickClosestClass([cls("a", "12:45")], at("12:50"));
    expect(r.match?.id).toBe("a");
  });

  it("matches a class about to start (check-in 5m before)", () => {
    const r = pickClosestClass([cls("a", "12:45")], at("12:40"));
    expect(r.match?.id).toBe("a");
  });

  it("matches a class that just ended (late front-desk confirmation)", () => {
    // BTM 10:45-11:35, check-in at 11:51 (16m after end) → within +30m window.
    const r = pickClosestClass([cls("btm", "10:45")], at("11:51"));
    expect(r.match?.id).toBe("btm");
  });

  it("between two back-to-back classes, picks the one starting nearest", () => {
    const a = cls("A", "12:45"); // 12:45-13:35
    const b = cls("B", "13:45"); // 13:45-14:35
    // 13:40 → 55m from A start, 5m from B start → B
    expect(pickClosestClass([a, b], at("13:40")).match?.id).toBe("B");
    // 12:50 → 5m from A, in A's window → A
    expect(pickClosestClass([a, b], at("12:50")).match?.id).toBe("A");
    // 13:50 → B in progress → B
    expect(pickClosestClass([a, b], at("13:50")).match?.id).toBe("B");
  });

  it("Silvia case: among her two bookings, picks today's not Monday's", () => {
    const today = cls("today", "08:15"); // 2026-06-26 08:15
    const monday: ClassCandidate = {
      id: "monday",
      startsAt: new Date("2026-06-29T12:15:00Z"),
      endsAt: new Date("2026-06-29T13:05:00Z"),
    };
    // Check-in 2026-06-26 08:07 → today's class (Monday is days away, out of window).
    const r = pickClosestClass([today, monday], at("08:07"));
    expect(r.match?.id).toBe("today");
  });

  it("returns none_in_window when the check-in is far from every class", () => {
    const r = pickClosestClass([cls("a", "08:00")], at("14:00"));
    expect(r.match).toBeNull();
    expect(r.reason).toBe("none_in_window");
  });

  it("respects the before-start window edge (exactly 45m before = in)", () => {
    const r = pickClosestClass([cls("a", "12:45")], at("12:00"));
    expect(r.match?.id).toBe("a");
  });

  it("rejects just outside the before-start window (46m before = out)", () => {
    const r = pickClosestClass([cls("a", "12:45")], at("11:59"));
    expect(r.match).toBeNull();
  });

  it("is deterministic on ties regardless of input order", () => {
    // Two classes equidistant from check-in → earlier start wins, either order.
    const a = cls("A", "12:00", 30); // 12:00-12:30
    const b = cls("B", "13:00", 30); // 13:00-13:30
    // check-in 12:30: 30m from A start, 30m from B start. A ends 12:30 (in
    // window), B starts 13:00 (30m before, in window). Tie on |dist|=30 → A.
    expect(pickClosestClass([a, b], at("12:30")).match?.id).toBe("A");
    expect(pickClosestClass([b, a], at("12:30")).match?.id).toBe("A");
  });
});
