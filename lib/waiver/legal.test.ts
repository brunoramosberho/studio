import { describe, expect, it } from "vitest";
import { getWaiverLegalFramework } from "./legal";

describe("getWaiverLegalFramework", () => {
  it("cites Mexican commercial and civil law for MX studios", () => {
    const legal = getWaiverLegalFramework("MX");
    expect(legal.pdfValidityLine).toContain("Código de Comercio");
    expect(legal.consentLabel).toContain("Código Civil Federal");
    expect(legal.consentLabel).not.toContain("eIDAS");
  });

  it("cites eIDAS for EU studios, case-insensitively", () => {
    expect(getWaiverLegalFramework("ES").pdfValidityLine).toContain("eIDAS");
    expect(getWaiverLegalFramework("fr").pdfValidityLine).toContain("eIDAS");
  });

  it("keeps eIDAS when the tenant has no default country (previous behaviour)", () => {
    expect(getWaiverLegalFramework(null).pdfValidityLine).toContain("eIDAS");
    expect(getWaiverLegalFramework(undefined).pdfValidityLine).toContain("eIDAS");
  });

  it("falls back to a neutral line outside MX and the EU", () => {
    const legal = getWaiverLegalFramework("US");
    expect(legal.pdfValidityLine).not.toContain("eIDAS");
    expect(legal.pdfValidityLine).toContain("legislación aplicable");
    expect(legal.consentLabel).toContain("firma manuscrita");
  });
});
