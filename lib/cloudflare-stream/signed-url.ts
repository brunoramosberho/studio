import { SignJWT, importPKCS8 } from "jose";
import {
  cloudflareStreamSigningKeyId,
  cloudflareStreamSigningKeyPem,
} from "./env";

export interface SignedTokenOptions {
  videoUid: string;
  ttlSeconds?: number;
  clientIp?: string;
}

export interface SignedTokenResult {
  token: string;
  expiresAt: Date;
}

const DEFAULT_TTL_SECONDS = 60 * 60;

interface AccessRule {
  type: string;
  action: "allow" | "block";
  ip?: string[];
}

interface JwtPayload extends Record<string, unknown> {
  sub: string;
  kid: string;
  exp: number;
  nbf: number;
  accessRules?: AccessRule[];
}

export function buildSignedTokenPayload(
  options: SignedTokenOptions,
  now: Date = new Date(),
): { payload: JwtPayload; expiresAt: Date } {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((issuedAt + ttl) * 1000);

  const payload: JwtPayload = {
    sub: options.videoUid,
    kid: cloudflareStreamSigningKeyId(),
    exp: issuedAt + ttl,
    nbf: issuedAt - 30,
  };

  if (options.clientIp) {
    payload.accessRules = [
      { type: "ip.src", action: "allow", ip: [options.clientIp] },
      { type: "any", action: "block" },
    ];
  }

  return { payload, expiresAt };
}

export async function signPlaybackToken(
  options: SignedTokenOptions,
): Promise<SignedTokenResult> {
  const { payload, expiresAt } = buildSignedTokenPayload(options);
  const key = await importPKCS8(cloudflareStreamSigningKeyPem(), "RS256");
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: payload.kid })
    .sign(key);

  return { token, expiresAt };
}
