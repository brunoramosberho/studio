import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lightweight Apple Wallet config check — no heavy imports (passkit-generator /
 * sharp), so hot routes like /api/gamification/me can report availability
 * without pulling the pass-generation deps into their bundle / cold start.
 */
export function isApplePassConfigured(): boolean {
  return Boolean(
    process.env.APPLE_PASS_TYPE_ID &&
      process.env.APPLE_TEAM_ID &&
      process.env.APPLE_PASS_SIGNER_CERT_BASE64 &&
      process.env.APPLE_PASS_SIGNER_KEY_BASE64 &&
      process.env.APPLE_PASS_WWDR_BASE64,
  );
}

/**
 * Per-pass authentication token for the PassKit web service. Derived via HMAC
 * from the server secret + serial number, so there's nothing to store — the web
 * service validates incoming requests by recomputing it.
 */
export function applePassAuthToken(serialNumber: string): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(serialNumber).digest("base64url");
}

/** Constant-time validation of an incoming `Authorization: ApplePass <token>`. */
export function verifyApplePassAuthToken(serialNumber: string, token: string): boolean {
  const expected = applePassAuthToken(serialNumber);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
