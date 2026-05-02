import { SignJWT, importPKCS8, type KeyLike } from "jose";
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

// Cache the imported signing key for the lifetime of the process. importPKCS8
// is otherwise called on every signPlaybackToken() invocation (e.g. when
// listing N videos and signing N thumbnail URLs).
let cachedSigningKey: Promise<KeyLike> | null = null;
function getSigningKey(): Promise<KeyLike> {
  if (!cachedSigningKey) {
    cachedSigningKey = importPKCS8(cloudflareStreamSigningKeyPem(), "RS256") as Promise<KeyLike>;
  }
  return cachedSigningKey;
}

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
  const key = await getSigningKey();
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: payload.kid })
    .sign(key);

  return { token, expiresAt };
}

/**
 * Replace the first path segment of a Cloudflare Stream URL with a JWT token.
 *
 * Cloudflare's signed-URL contract is: when `requireSignedURLs=true`, the
 * video uid in the URL path is replaced with a JWT. So:
 *   raw:    https://customer-<sub>.cloudflarestream.com/<videoUid>/thumbnails/thumbnail.jpg
 *   signed: https://customer-<sub>.cloudflarestream.com/<token>/thumbnails/thumbnail.jpg
 *
 * This works for thumbnails, manifests, and direct mp4 downloads. It does not
 * apply to the iframe player (that one takes the token via path too, but is
 * built from a different host — `iframe.cloudflarestream.com`).
 */
export function applyTokenToStreamUrl(rawUrl: string, token: string): string {
  try {
    const u = new URL(rawUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return rawUrl;
    parts[0] = token;
    u.pathname = "/" + parts.join("/");
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Mint a signed thumbnail URL given the raw URL Cloudflare returned at
 * processing-complete time. The token TTL defaults to 1h, which is plenty for
 * a server-rendered list view — the page typically reloads more often than that.
 */
export async function signThumbnailUrl(params: {
  videoUid: string;
  rawThumbnailUrl: string;
  ttlSeconds?: number;
}): Promise<string> {
  const { token } = await signPlaybackToken({
    videoUid: params.videoUid,
    ttlSeconds: params.ttlSeconds ?? 60 * 60,
  });
  return applyTokenToStreamUrl(params.rawThumbnailUrl, token);
}
