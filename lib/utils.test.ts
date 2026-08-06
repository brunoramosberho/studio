import { describe, it, expect } from "vitest";
import {
  calendarDaysBetween,
  capitalizeName,
  composeName,
  formatDateInZone,
  splitName,
} from "./utils";

describe("capitalizeName", () => {
  it("capitalises the first letter of each word", () => {
    expect(capitalizeName("juan perez")).toBe("Juan Perez");
  });

  it("lowercases the rest of each word", () => {
    expect(capitalizeName("jUAN PEREZ")).toBe("Juan Perez");
  });

  it("handles hyphenated and apostrophe names", () => {
    expect(capitalizeName("ana-maria")).toBe("Ana-Maria");
    expect(capitalizeName("o'brien")).toBe("O'Brien");
  });

  it("preserves a trailing space while typing", () => {
    expect(capitalizeName("juan ")).toBe("Juan ");
  });

  it("handles accented characters", () => {
    expect(capitalizeName("josé maría")).toBe("José María");
  });

  it("returns empty string unchanged", () => {
    expect(capitalizeName("")).toBe("");
  });
});

describe("composeName", () => {
  it("joins first and last name", () => {
    expect(composeName("Juan", "Perez")).toBe("Juan Perez");
  });

  it("trims and skips empty parts", () => {
    expect(composeName("Juan", "")).toBe("Juan");
    expect(composeName("  ", "Perez")).toBe("Perez");
  });

  it("returns null when both are empty", () => {
    expect(composeName(null, null)).toBeNull();
    expect(composeName("", "  ")).toBeNull();
  });
});

describe("splitName", () => {
  it("splits first token as firstName and the rest as lastName", () => {
    expect(splitName("Juan Perez Lopez")).toEqual({
      firstName: "Juan",
      lastName: "Perez Lopez",
    });
  });

  it("handles a single token", () => {
    expect(splitName("Juan")).toEqual({ firstName: "Juan", lastName: null });
  });

  it("returns nulls for empty/whitespace input", () => {
    expect(splitName("   ")).toEqual({ firstName: null, lastName: null });
    expect(splitName(null)).toEqual({ firstName: null, lastName: null });
  });
});

describe("calendarDaysBetween", () => {
  it("counts whole days forward and back", () => {
    expect(calendarDaysBetween("2026-08-06", "2026-08-15")).toBe(9);
    expect(calendarDaysBetween("2026-08-15", "2026-08-15")).toBe(0);
    expect(calendarDaysBetween("2026-08-16", "2026-08-15")).toBe(-1);
  });

  it("crosses months and years", () => {
    expect(calendarDaysBetween("2026-08-30", "2026-09-02")).toBe(3);
    expect(calendarDaysBetween("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("counts the leap day", () => {
    expect(calendarDaysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("is unaffected by a DST change in between", () => {
    // Parsing as UTC is what makes this hold: Europe/Madrid springs forward on
    // 2026-03-29, so a local-time subtraction would come out at 30.96 days and
    // round to the wrong answer.
    expect(calendarDaysBetween("2026-03-15", "2026-04-15")).toBe(31);
  });
});

describe("calendarDaysBetween with formatDateInZone", () => {
  // The pair as the challenge deadline uses them: an instant stored as 23:59
  // studio-local, read back as the day the studio actually meant.
  const madridClose = "2026-08-15T21:59:00.000Z"; // 23:59 in Madrid (UTC+2)
  const cdmxClose = "2026-08-16T05:59:00.000Z"; // 23:59 in CDMX (UTC-6)

  it("reads a Madrid deadline as the 15th", () => {
    expect(formatDateInZone(madridClose, "Europe/Madrid")).toBe("2026-08-15");
  });

  it("reads a CDMX deadline as the 15th, not the 16th", () => {
    // The UTC date here is already the 16th — using it raw is the off-by-one
    // that would tell a member they have a day they don't have.
    expect(cdmxClose.slice(0, 10)).toBe("2026-08-16");
    expect(formatDateInZone(cdmxClose, "America/Mexico_City")).toBe("2026-08-15");
  });

  it("says zero days left on the closing day itself, in either studio", () => {
    const duringDay = "2026-08-15T18:00:00.000Z"; // 20:00 Madrid, 12:00 CDMX
    for (const [tz, close] of [
      ["Europe/Madrid", madridClose],
      ["America/Mexico_City", cdmxClose],
    ] as const) {
      expect(
        calendarDaysBetween(formatDateInZone(duringDay, tz), formatDateInZone(close, tz)),
      ).toBe(0);
    }
  });
});
