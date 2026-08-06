// Which electronic-signature law backs a waiver signature depends on the
// studio's jurisdiction (the tenant's default country), not the member's.
//
// - Mexico: private-party e-signatures rest on the Código de Comercio
//   (arts. 89 y ss.) and the Código Civil Federal (art. 1803). The Ley de
//   Firma Electrónica Avanzada does not apply here — it governs
//   certificate-based signatures (e.firma) in acts with the federal public
//   administration.
// - EU members: Regulation (EU) 910/2014 (eIDAS).
// - Anywhere else: a neutral line that doesn't cite a foreign statute.

export interface WaiverLegalFramework {
  /** Consent-checkbox sentence on the sign page (Spanish, like the rest of the flow). */
  consentLabel: string;
  /** One-line validity statement in the signed PDF's footer. */
  pdfValidityLine: string;
}

const EIDAS: WaiverLegalFramework = {
  consentLabel:
    "Al marcar esta casilla acepto que mi firma electrónica tenga la misma validez que una firma manuscrita, conforme al Reglamento eIDAS (UE) 910/2014.",
  pdfValidityLine: "Válido conforme al Reglamento eIDAS (UE) 910/2014",
};

const MEXICO: WaiverLegalFramework = {
  consentLabel:
    "Al marcar esta casilla acepto que mi firma electrónica tenga la misma validez que una firma manuscrita, conforme a los artículos 89 y siguientes del Código de Comercio y 1803 del Código Civil Federal de México.",
  pdfValidityLine:
    "Válido conforme al Código de Comercio (arts. 89 y ss.) y al Código Civil Federal (art. 1803) de México",
};

const GENERIC: WaiverLegalFramework = {
  consentLabel:
    "Al marcar esta casilla acepto que mi firma electrónica tenga la misma validez que una firma manuscrita, conforme a la legislación aplicable en materia de firma electrónica.",
  pdfValidityLine:
    "Válido conforme a la legislación aplicable en materia de firma electrónica",
};

const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/**
 * `countryCode` is the tenant's default-country ISO 3166-1 alpha-2 code.
 * Null/unknown falls back to eIDAS, the previous behaviour for every tenant.
 */
export function getWaiverLegalFramework(
  countryCode?: string | null,
): WaiverLegalFramework {
  const code = countryCode?.toUpperCase() ?? null;
  if (code === "MX") return MEXICO;
  if (code === null || EU_COUNTRY_CODES.has(code)) return EIDAS;
  return GENERIC;
}
