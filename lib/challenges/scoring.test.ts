import { describe, expect, it } from "vitest";
import {
  applyToLedger,
  computeStreaks,
  emptyLedger,
  pace,
  scoreClass,
  type ChallengeRules,
  type ScorableClass,
} from "./scoring";

const RULES: ChallengeRules = {
  basePoints: 10,
  firstDisciplineBonus: 15,
  firstCoachBonus: 10,
  dailyPointsCap: 25,
  bonusSlots: [{ dayOfWeek: 1, hour: 10, points: 5 }],
};

const cls = (over: Partial<ScorableClass> = {}): ScorableClass => ({
  classTypeId: "sculpt",
  coachId: "ana",
  localDate: "2026-07-01",
  dayOfWeek: 3,
  hour: 19,
  ...over,
});

function take(rules: ChallengeRules, classes: ScorableClass[]) {
  const ledger = emptyLedger();
  return classes.map((c) => {
    const awards = scoreClass(c, rules, ledger);
    applyToLedger(ledger, c, awards);
    return awards.reduce((sum, a) => sum + a.points, 0);
  });
}

describe("scoreClass", () => {
  it("pays base plus both first-time bonuses on the very first class", () => {
    expect(take(RULES, [cls()])).toEqual([35]);
  });

  it("stops paying the bonuses once the discipline and coach are known", () => {
    // Uncapped, so this asserts the bonuses alone — the cap has its own test.
    const rules = { ...RULES, dailyPointsCap: null };
    expect(take(rules, [cls(), cls(), cls()])).toEqual([35, 10, 10]);
  });

  it("pays the discipline bonus again for a different discipline", () => {
    const [, second] = take(RULES, [cls(), cls({ classTypeId: "barre" })]);
    expect(second).toBe(25); // base + first discipline, same coach
  });

  it("adds the off-peak bonus only in a configured slot", () => {
    expect(take(RULES, [cls({ dayOfWeek: 1, hour: 10 })])).toEqual([40]);
    expect(take(RULES, [cls({ dayOfWeek: 1, hour: 11 })])).toEqual([35]);
  });

  it("never lets the daily cap eat a first-time bonus", () => {
    // Three classes the same day: base is capped at 25, but the bonuses
    // for a new discipline and a new coach still pay in full.
    const day = [
      cls(),
      cls({ classTypeId: "barre", coachId: "lu" }),
      cls({ classTypeId: "cycle", coachId: "sofi" }),
    ];
    expect(take(RULES, day)).toEqual([35, 35, 30]);
  });

  it("caps repeat classes on the same day", () => {
    const day = [cls(), cls(), cls(), cls()];
    // 35, then base 10, 5 (cap reached), 0.
    expect(take(RULES, day)).toEqual([35, 10, 5, 0]);
  });

  it("resets the cap on the next day", () => {
    const rules = { ...RULES, dailyPointsCap: 10 };
    expect(
      take(rules, [cls(), cls(), cls({ localDate: "2026-07-02" })]),
    ).toEqual([35, 0, 10]);
  });

  it("treats a null cap as unlimited", () => {
    const rules = { ...RULES, dailyPointsCap: null };
    expect(take(rules, [cls(), cls(), cls(), cls()])).toEqual([35, 10, 10, 10]);
  });
});

describe("computeStreaks", () => {
  it("counts consecutive studio-local days", () => {
    const dates = ["2026-07-01", "2026-07-02", "2026-07-03"];
    expect(computeStreaks(dates, "2026-07-03")).toEqual({ current: 3, longest: 3 });
  });

  it("ignores two classes on the same day", () => {
    const dates = ["2026-07-01", "2026-07-01", "2026-07-02"];
    expect(computeStreaks(dates, "2026-07-02")).toEqual({ current: 2, longest: 2 });
  });

  it("keeps the streak alive on the day after the last class", () => {
    expect(computeStreaks(["2026-07-01", "2026-07-02"], "2026-07-03").current).toBe(2);
  });

  it("breaks the streak after a missed day", () => {
    const s = computeStreaks(["2026-07-01", "2026-07-02"], "2026-07-04");
    expect(s).toEqual({ current: 0, longest: 2 });
  });

  it("remembers the longest run after it breaks", () => {
    const dates = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-10"];
    expect(computeStreaks(dates, "2026-07-10")).toEqual({ current: 1, longest: 3 });
  });

  it("crosses a month boundary", () => {
    expect(computeStreaks(["2026-07-31", "2026-08-01"], "2026-08-01").longest).toBe(2);
  });

  it("handles no activity", () => {
    expect(computeStreaks([], "2026-07-01")).toEqual({ current: 0, longest: 0 });
  });
});

describe("pace", () => {
  it("hides a ranking until the member has enough days", () => {
    expect(pace(30, 1)).toBeNull();
    expect(pace(30, 2)).toBeNull();
  });

  it("returns points per elapsed day once past the floor", () => {
    expect(pace(30, 3)).toBe(10);
    expect(pace(100, 7)).toBe(14.29);
  });
});
