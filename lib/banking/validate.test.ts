import { describe, expect, it } from "vitest";
import { validateIban, validateClabe, maskAccount, normalizeAccount } from "./validate";

describe("validateIban", () => {
  it("accepts well-known valid IBANs", () => {
    expect(validateIban("ES91 2100 0418 4502 0005 1332").valid).toBe(true);
    expect(validateIban("DE89 3704 0044 0532 0130 00").valid).toBe(true);
    expect(validateIban("GB82 WEST 1234 5698 7654 32").valid).toBe(true);
    expect(validateIban("es9121000418450200051332").valid).toBe(true); // case/space-insensitive
  });

  it("rejects a checksum failure (one digit off)", () => {
    expect(validateIban("ES91 2100 0418 4502 0005 1333").valid).toBe(false);
  });

  it("rejects wrong length for the country", () => {
    const r = validateIban("ES91 2100 0418 4502 0005 13");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/24/);
  });

  it("rejects garbage and Mexican accounts", () => {
    expect(validateIban("HOLA123").valid).toBe(false);
    expect(validateIban("MX12345678901234567890").valid).toBe(false);
  });
});

describe("validateClabe", () => {
  it("accepts a valid CLABE (checksum ok)", () => {
    expect(validateClabe("032180000118359719").valid).toBe(true);
    expect(validateClabe("032-180-00011835971-9").valid).toBe(true); // separators ok
  });

  it("rejects a checksum failure", () => {
    expect(validateClabe("032180000118359718").valid).toBe(false);
  });

  it("rejects wrong length or non-digits", () => {
    expect(validateClabe("03218000011835971").valid).toBe(false);
    expect(validateClabe("03218000011835971X").valid).toBe(false);
  });
});

describe("helpers", () => {
  it("normalizes and masks", () => {
    expect(normalizeAccount("es91 2100-0418")).toBe("ES9121000418");
    expect(maskAccount("ES9121000418450200051332")).toBe("ES91 •••• 1332");
  });
});
