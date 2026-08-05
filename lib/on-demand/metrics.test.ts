import { describe, expect, it } from "vitest";
import { formatDuration, summariseSessions } from "./metrics";

const s = (watchedSeconds: number, furthestSeconds: number) => ({
  watchedSeconds,
  furthestSeconds,
});

describe("summariseSessions", () => {
  it("averages only the sessions that carry real playback data", () => {
    // The zeros are sessions from before measurement shipped. Counting them
    // would halve the average and make every video look ignored.
    const stats = summariseSessions([s(300, 320), s(0, 0), s(100, 120)], 400);
    expect(stats.measured).toBe(2);
    expect(stats.avgWatchedSeconds).toBe(200);
  });

  it("reports nothing rather than zero when no session was measured", () => {
    const stats = summariseSessions([s(0, 0), s(0, 0)], 400);
    expect(stats).toEqual({
      measured: 0,
      avgWatchedSeconds: 0,
      avgCompletionPct: null,
      finished: 0,
    });
  });

  it("counts a video finished slightly before the very end", () => {
    // 90% of a 346s video: someone who skips the cool-down still finished it.
    expect(summariseSessions([s(320, 315)], 346).finished).toBe(1);
    expect(summariseSessions([s(200, 200)], 346).finished).toBe(0);
  });

  it("never reports more than 100% completion", () => {
    // Players sometimes report a position past the last frame.
    expect(summariseSessions([s(350, 360)], 346).avgCompletionPct).toBe(100);
  });

  it("separates watching a lot from getting far", () => {
    // Replayed the same opening minute over and over: high watch time, low
    // completion. The two numbers must not be conflated.
    const stats = summariseSessions([s(600, 60)], 600);
    expect(stats.avgWatchedSeconds).toBe(600);
    expect(stats.avgCompletionPct).toBe(10);
    expect(stats.finished).toBe(0);
  });

  it("has no opinion on completion when the runtime is unknown", () => {
    const stats = summariseSessions([s(120, 120)], null);
    expect(stats.avgWatchedSeconds).toBe(120);
    expect(stats.avgCompletionPct).toBeNull();
  });

  it("handles an empty list", () => {
    expect(summariseSessions([], 300).measured).toBe(0);
  });
});

describe("formatDuration", () => {
  it("pads the seconds", () => {
    expect(formatDuration(346)).toBe("5:46");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(9)).toBe("0:09");
  });

  it("doesn't go negative", () => {
    expect(formatDuration(-10)).toBe("0:00");
  });
});
