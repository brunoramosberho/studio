import { describe, it, expect } from "vitest";
import { capitalizeName, composeName, splitName } from "./utils";

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
