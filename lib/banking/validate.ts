// Pure bank-account validation — IBAN (ISO 13616 mod-97) and Mexican CLABE
// (18-digit weighted checksum). No I/O; safe to import from client and server.

export type PayoutMethod = "iban" | "clabe";

/** Uppercase + strip spaces/dashes. */
export function normalizeAccount(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

// Official IBAN lengths for the countries we're likely to see. Anything not
// listed falls back to the ISO bounds (15..34) + mod-97, which is still a
// strong check.
const IBAN_LENGTHS: Record<string, number> = {
  ES: 24, PT: 25, FR: 27, DE: 22, IT: 27, NL: 18, BE: 16, GB: 22, IE: 22,
  AD: 24, AT: 20, CH: 21, LU: 20, MC: 27, MX: 0 /* MX uses CLABE, not IBAN */,
};

export function validateIban(raw: string): { valid: boolean; error?: string } {
  const iban = normalizeAccount(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return { valid: false, error: "Formato inválido — debe iniciar con país y 2 dígitos (ej. ES91…)" };
  }
  const country = iban.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  if (expected === 0) {
    return { valid: false, error: "Para México usa CLABE, no IBAN" };
  }
  if (expected ? iban.length !== expected : iban.length < 15 || iban.length > 34) {
    return {
      valid: false,
      error: expected
        ? `Un IBAN de ${country} tiene ${expected} caracteres (tiene ${iban.length})`
        : "Longitud de IBAN inválida",
    };
  }
  // mod-97: move the first 4 chars to the end, map letters A→10…Z→35, mod 97 === 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of v) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  if (remainder !== 1) {
    return { valid: false, error: "IBAN inválido — revisa los dígitos (falla la verificación)" };
  }
  return { valid: true };
}

export function validateClabe(raw: string): { valid: boolean; error?: string } {
  const clabe = normalizeAccount(raw);
  if (!/^\d+$/.test(clabe)) {
    return { valid: false, error: "La CLABE solo lleva dígitos" };
  }
  if (clabe.length !== 18) {
    return { valid: false, error: `Una CLABE tiene 18 dígitos (tiene ${clabe.length})` };
  }
  // Weighted checksum: weights 3,7,1 repeating over the first 17 digits;
  // control digit = (10 − (Σ (digit×weight mod 10) mod 10)) mod 10.
  const weights = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += (Number(clabe[i]) * weights[i % 3]) % 10;
  }
  const control = (10 - (sum % 10)) % 10;
  if (control !== Number(clabe[17])) {
    return { valid: false, error: "CLABE inválida — revisa los dígitos (falla la verificación)" };
  }
  return { valid: true };
}

export function validatePayoutAccount(
  method: PayoutMethod,
  raw: string,
): { valid: boolean; error?: string } {
  return method === "iban" ? validateIban(raw) : validateClabe(raw);
}

/** "ES91 •••• 1332" — safe to show in tenant UI. */
export function maskAccount(account: string): string {
  const a = normalizeAccount(account);
  if (a.length <= 8) return a;
  return `${a.slice(0, 4)} •••• ${a.slice(-4)}`;
}
