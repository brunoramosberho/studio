import crypto from "crypto";

export function generateSignatureHash(signatureBase64: string): string {
  return crypto.createHash("sha256").update(signatureBase64).digest("hex");
}
