import { describe, expect, it } from "vitest";
import {
  generateLinkCode,
  hashLinkCode,
  linkCodeMatches,
  normalizeClaimEmail,
} from "./link-code";

describe("generateLinkCode", () => {
  it("always returns exactly six digits (zero-padded)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateLinkCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashLinkCode / linkCodeMatches", () => {
  it("round-trips the right code and rejects the wrong one", () => {
    const hash = hashLinkCode("row_1", "042137");
    expect(linkCodeMatches("row_1", "042137", hash)).toBe(true);
    expect(linkCodeMatches("row_1", "042138", hash)).toBe(false);
  });

  it("salts by row id so equal codes don't share a digest", () => {
    expect(hashLinkCode("row_1", "042137")).not.toBe(hashLinkCode("row_2", "042137"));
    expect(linkCodeMatches("row_2", "042137", hashLinkCode("row_1", "042137"))).toBe(false);
  });

  it("tolerates malformed stored hashes without throwing", () => {
    expect(linkCodeMatches("row_1", "042137", "not-hex")).toBe(false);
  });
});

describe("normalizeClaimEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeClaimEmail("  Ana.Lopez@Empresa.MX ")).toBe("ana.lopez@empresa.mx");
  });

  it("rejects shapes that cannot be an address", () => {
    expect(normalizeClaimEmail("")).toBeNull();
    expect(normalizeClaimEmail("no-arroba")).toBeNull();
    expect(normalizeClaimEmail("a@b")).toBeNull();
    expect(normalizeClaimEmail("dos @espacios.mx")).toBeNull();
    expect(normalizeClaimEmail(`${"x".repeat(250)}@largo.mx`)).toBeNull();
  });

  it("accepts corporate-looking addresses", () => {
    expect(normalizeClaimEmail("ana.lopez@wellhub-cliente.com.mx")).toBe(
      "ana.lopez@wellhub-cliente.com.mx",
    );
  });
});
