import { describe, expect, it } from "vitest";
import {
  type AvailabilityBlockLite,
  formatMinutes,
  getCoachStatusForSlot,
  getCoverageStatus,
  getMondayBasedDow,
  isAlignedToSlot,
  parseHhmm,
} from "./availability";

const STUDIO_A = "studio-a";
const STUDIO_B = "studio-b";

function recurringAvailability(
  opts: {
    dayOfWeek: number[];
    startTime: string;
    endTime: string;
    prefs?: { studioId: string; preference: "preferred" | "ok_if_needed" }[];
    status?: string;
  },
): AvailabilityBlockLite {
  return {
    kind: "availability",
    type: "recurring",
    dayOfWeek: opts.dayOfWeek,
    startTime: opts.startTime,
    endTime: opts.endTime,
    startDate: null,
    endDate: null,
    isAllDay: false,
    status: opts.status ?? "active",
    studioPreferences: opts.prefs ?? [{ studioId: STUDIO_A, preference: "preferred" }],
  };
}

function oneTimeTimeOff(opts: {
  startDate: Date;
  endDate: Date;
  startTime?: string | null;
  endTime?: string | null;
  isAllDay?: boolean;
  status?: string;
}): AvailabilityBlockLite {
  return {
    kind: "time_off",
    type: "one_time",
    dayOfWeek: [],
    startTime: opts.startTime ?? null,
    endTime: opts.endTime ?? null,
    startDate: opts.startDate,
    endDate: opts.endDate,
    isAllDay: opts.isAllDay ?? false,
    status: opts.status ?? "active",
  };
}

describe("parseHhmm / formatMinutes / alignment", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseHhmm("07:00")).toBe(420);
    expect(parseHhmm("00:15")).toBe(15);
    expect(parseHhmm("21:45")).toBe(21 * 60 + 45);
  });

  it("returns null on invalid input", () => {
    expect(parseHhmm(null)).toBeNull();
    expect(parseHhmm("")).toBeNull();
    expect(parseHhmm("99")).toBeNull();
    expect(parseHhmm("7:00")).toBe(420); // single-digit hour still parses
  });

  it("formats minutes back to HH:MM with leading zeros", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(420)).toBe("07:00");
    expect(formatMinutes(21 * 60 + 45)).toBe("21:45");
  });

  it("validates 30-min alignment", () => {
    expect(isAlignedToSlot(0)).toBe(true);
    expect(isAlignedToSlot(30)).toBe(true);
    expect(isAlignedToSlot(420)).toBe(true);
    expect(isAlignedToSlot(7)).toBe(false);
    expect(isAlignedToSlot(15)).toBe(false);
    expect(isAlignedToSlot(20)).toBe(false);
  });
});

describe("getMondayBasedDow", () => {
  it("maps Sunday to 6 and Monday to 0", () => {
    expect(getMondayBasedDow(new Date("2026-05-18T12:00:00"))).toBe(0); // Mon
    expect(getMondayBasedDow(new Date("2026-05-19T12:00:00"))).toBe(1); // Tue
    expect(getMondayBasedDow(new Date("2026-05-24T12:00:00"))).toBe(6); // Sun
  });
});

describe("getCoachStatusForSlot", () => {
  // 2026-05-19 is a Tuesday → Monday-based dow = 1
  const tuesday = new Date("2026-05-19T12:00:00");
  const wednesday = new Date("2026-05-20T12:00:00");

  it("returns 'unavailable' when no availability block covers the slot", () => {
    expect(
      getCoachStatusForSlot({
        blocks: [],
        date: tuesday,
        startMin: 12 * 60,
        endMin: 13 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("unavailable");
  });

  it("returns 'preferred' when an availability block covers the slot for the studio", () => {
    const block = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
    });
    expect(
      getCoachStatusForSlot({
        blocks: [block],
        date: tuesday,
        startMin: 13 * 60,
        endMin: 14 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("preferred");
  });

  it("returns 'ok_if_needed' when the studio is the only secondary option", () => {
    const block = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
      prefs: [{ studioId: STUDIO_B, preference: "ok_if_needed" }],
    });
    expect(
      getCoachStatusForSlot({
        blocks: [block],
        date: tuesday,
        startMin: 13 * 60,
        endMin: 14 * 60,
        studioId: STUDIO_B,
      }),
    ).toBe("ok_if_needed");
  });

  it("returns 'unavailable' when the studio isn't in the block's preferences", () => {
    const block = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
      prefs: [{ studioId: STUDIO_A, preference: "preferred" }],
    });
    expect(
      getCoachStatusForSlot({
        blocks: [block],
        date: tuesday,
        startMin: 13 * 60,
        endMin: 14 * 60,
        studioId: STUDIO_B,
      }),
    ).toBe("unavailable");
  });

  it("ignores availability blocks on other days", () => {
    const block = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
    });
    expect(
      getCoachStatusForSlot({
        blocks: [block],
        date: wednesday,
        startMin: 13 * 60,
        endMin: 14 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("unavailable");
  });

  it("returns 'time_off' when a one-time time_off block covers the slot", () => {
    const avail = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
    });
    const off = oneTimeTimeOff({
      startDate: tuesday,
      endDate: tuesday,
      startTime: "15:00",
      endTime: "16:00",
    });
    expect(
      getCoachStatusForSlot({
        blocks: [avail, off],
        date: tuesday,
        startMin: 15 * 60,
        endMin: 16 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("time_off");
  });

  it("still returns 'preferred' for slots outside the time_off carve-out", () => {
    const avail = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
    });
    const off = oneTimeTimeOff({
      startDate: tuesday,
      endDate: tuesday,
      startTime: "15:00",
      endTime: "16:00",
    });
    expect(
      getCoachStatusForSlot({
        blocks: [avail, off],
        date: tuesday,
        startMin: 13 * 60,
        endMin: 14 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("preferred");
  });

  it("supports multiple availability blocks per day (the Gloria case)", () => {
    // "Lunes 7-12 y 17-21 en Studio A, lo demás no"
    const morning = recurringAvailability({
      dayOfWeek: [0],
      startTime: "07:00",
      endTime: "12:00",
    });
    const evening = recurringAvailability({
      dayOfWeek: [0],
      startTime: "17:00",
      endTime: "21:00",
    });
    const monday = new Date("2026-05-18T08:00:00");
    expect(
      getCoachStatusForSlot({
        blocks: [morning, evening],
        date: monday,
        startMin: 8 * 60,
        endMin: 9 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("preferred");
    expect(
      getCoachStatusForSlot({
        blocks: [morning, evening],
        date: monday,
        startMin: 14 * 60,
        endMin: 15 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("unavailable");
    expect(
      getCoachStatusForSlot({
        blocks: [morning, evening],
        date: monday,
        startMin: 18 * 60,
        endMin: 19 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("preferred");
  });

  it("prefers 'preferred' over 'ok_if_needed' when two availability blocks overlap", () => {
    const a = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
      prefs: [{ studioId: STUDIO_A, preference: "ok_if_needed" }],
    });
    const b = recurringAvailability({
      dayOfWeek: [1],
      startTime: "13:00",
      endTime: "15:00",
      prefs: [{ studioId: STUDIO_A, preference: "preferred" }],
    });
    expect(
      getCoachStatusForSlot({
        blocks: [a, b],
        date: tuesday,
        startMin: 13 * 60 + 30,
        endMin: 14 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("preferred");
  });

  it("ignores rejected blocks", () => {
    const block = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
      status: "rejected",
    });
    expect(
      getCoachStatusForSlot({
        blocks: [block],
        date: tuesday,
        startMin: 13 * 60,
        endMin: 14 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("unavailable");
  });

  it("ignores pending availability (only active counts for positive)", () => {
    const block = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
      status: "pending_approval",
    });
    expect(
      getCoachStatusForSlot({
        blocks: [block],
        date: tuesday,
        startMin: 13 * 60,
        endMin: 14 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("unavailable");
  });

  it("respects pending time_off as if it were active (conservative)", () => {
    const avail = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
    });
    const off = oneTimeTimeOff({
      startDate: tuesday,
      endDate: tuesday,
      startTime: "15:00",
      endTime: "16:00",
      status: "pending_approval",
    });
    expect(
      getCoachStatusForSlot({
        blocks: [avail, off],
        date: tuesday,
        startMin: 15 * 60,
        endMin: 16 * 60,
        studioId: STUDIO_A,
      }),
    ).toBe("time_off");
  });
});

describe("getCoverageStatus (day badge)", () => {
  const tuesday = new Date("2026-05-19T12:00:00");

  it("returns 'available' when the day has no blocks at all", () => {
    expect(getCoverageStatus([], tuesday)).toBe("available");
  });

  it("returns 'blocked' when an all-day time_off covers the date", () => {
    const off = oneTimeTimeOff({
      startDate: tuesday,
      endDate: tuesday,
      isAllDay: true,
    });
    expect(getCoverageStatus([off], tuesday)).toBe("blocked");
  });

  it("returns 'partial' when only some time_off is carved out of availability", () => {
    const avail = recurringAvailability({
      dayOfWeek: [1],
      startTime: "12:00",
      endTime: "18:00",
    });
    const off = oneTimeTimeOff({
      startDate: tuesday,
      endDate: tuesday,
      startTime: "15:00",
      endTime: "16:00",
    });
    expect(getCoverageStatus([avail, off], tuesday)).toBe("partial");
  });

  it("returns 'pending' when only a pending time_off exists", () => {
    const off = oneTimeTimeOff({
      startDate: tuesday,
      endDate: tuesday,
      isAllDay: true,
      status: "pending_approval",
    });
    expect(getCoverageStatus([off], tuesday)).toBe("pending");
  });
});
