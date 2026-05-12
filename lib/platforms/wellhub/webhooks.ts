// Wellhub signs webhook bodies with HMAC-SHA1 (per spec; not SHA-256) and
// transmits the hex digest in uppercase via the `X-Gympass-Signature` header.
// We use constant-time comparison to avoid trivial timing side channels.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-gympass-signature";

export function computeSignature(rawBody: string, secret: string): string {
  return createHmac("sha1", secret).update(rawBody, "utf8").digest("hex").toUpperCase();
}

export function verifySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = computeSignature(rawBody, secret);
  // The header may arrive with or without a `0X` prefix; normalize both ways.
  const provided = signatureHeader.trim().toUpperCase().replace(/^0X/, "");
  const normalizedExpected = expected.replace(/^0X/, "");
  if (normalizedExpected.length !== provided.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(normalizedExpected, "utf8"),
      Buffer.from(provided, "utf8"),
    );
  } catch {
    return false;
  }
}
