import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HISTORICAL_COACH_QUERIES } from "./archive";

/**
 * Sixteen places query instructors. Forgetting one is not a loud failure: an
 * archived instructor simply reappears in a picker, or — worse in the other
 * direction — a filter added to payroll quietly drops someone from the month
 * they are owed for.
 *
 * So every query site must either filter with ACTIVE_COACH or be listed as
 * deliberately historical, and this test fails when a new one appears.
 */
function queryFiles(): string[] {
  const out = execSync(
    "grep -rl 'coachProfile\\.findMany' app lib components 2>/dev/null || true",
    { encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean).sort();
}

describe("instructor query sites", () => {
  const files = queryFiles();

  it("finds the query sites at all, so the checks below can't pass vacuously", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("every site either filters archived instructors out or is a declared exception", () => {
    const unaccounted = files.filter((file) => {
      if (HISTORICAL_COACH_QUERIES[file]) return false;
      return !readFileSync(file, "utf8").includes("ACTIVE_COACH");
    });

    expect(
      unaccounted,
      "These query instructors without excluding archived ones. Either spread " +
        "ACTIVE_COACH into the where clause, or — if the surface reports on the " +
        "past and must keep them — add the file to HISTORICAL_COACH_QUERIES with " +
        "the reason.",
    ).toEqual([]);
  });

  it("does not carry exceptions for files that no longer query instructors", () => {
    const stale = Object.keys(HISTORICAL_COACH_QUERIES).filter((f) => !files.includes(f));
    expect(stale).toEqual([]);
  });

  it("every exception explains itself", () => {
    for (const [file, reason] of Object.entries(HISTORICAL_COACH_QUERIES)) {
      expect(reason.length, `${file} needs a reason worth reading`).toBeGreaterThan(20);
    }
  });
});
