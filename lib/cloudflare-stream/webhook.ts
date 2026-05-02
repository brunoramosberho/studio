import crypto from "node:crypto";
import { cloudflareStreamWebhookSecret } from "./env";

/**
 * Verify a Cloudflare Stream webhook signature.
 *
 * Cloudflare sends a header `Webhook-Signature: time=<ts>,sig1=<hex>` where
 * sig1 is HMAC-SHA256 of `<ts>.<rawBody>` with the shared secret.
 */
export function verifyCloudflareStreamSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  toleranceSeconds?: number;
  now?: Date;
}): boolean {
  const { rawBody, signatureHeader } = params;
  if (!signatureHeader) return false;

  const tolerance = params.toleranceSeconds ?? 600;
  const now = params.now ?? new Date();

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [k, ...rest] = part.split("=");
      return [k.trim(), rest.join("=").trim()];
    }),
  );

  const ts = Number(parts.time);
  const sig = parts.sig1;
  if (!ts || !sig) return false;

  if (Math.abs(now.getTime() / 1000 - ts) > tolerance) return false;

  const secret = cloudflareStreamWebhookSecret();
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}.${rawBody}`)
    .digest("hex");

  if (expected.length !== sig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

export interface CloudflareStreamWebhookPayload {
  uid: string;
  status?: { state?: string; errorReasonText?: string };
  duration?: number;
  thumbnail?: string;
  readyToStream?: boolean;
  input?: { width?: number; height?: number };
  meta?: Record<string, string>;
}
