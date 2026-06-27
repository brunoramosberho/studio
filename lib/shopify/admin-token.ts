import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { exchangeClientCredentials } from "@/lib/shopify/admin";

// Resolves a usable Admin API access token for a tenant's Shopify connection.
//
// Dev Dashboard apps issue short-lived (24h) tokens via the client-credentials
// grant, so we exchange the stored Client ID + Secret on demand and cache the
// result in memory until shortly before it expires. The cache is per-process
// (fine for serverless: a cold start just re-exchanges, which is cheap).

interface CachedToken {
  token: string;
  /** Epoch ms after which we must re-exchange. */
  expiresAt: number;
}

const cache = new Map<string, CachedToken>();
// Refresh a minute early so an in-flight request never uses an expired token.
const SKEW_MS = 60_000;

export interface AdminConnection {
  shopDomain: string;
  token: string;
}

/**
 * Returns `{ shopDomain, token }` for the tenant's Shopify Admin API, or null
 * if the tenant hasn't configured the client credentials. Throws if the
 * credentials are present but the exchange fails (invalid creds / app not
 * installed / wrong domain).
 */
export async function getAdminConnection(
  tenantId: string,
): Promise<AdminConnection | null> {
  const config = await prisma.shopifyConfig.findUnique({
    where: { tenantId },
    select: {
      shopDomain: true,
      adminShopDomain: true,
      adminClientId: true,
      adminClientSecret: true,
    },
  });

  if (!config?.adminClientId || !config.adminClientSecret) return null;

  // Admin calls need the myshopify domain; shopDomain may be a vanity domain.
  const domain = config.adminShopDomain || config.shopDomain;
  const clientId = config.adminClientId;
  const cacheKey = `${domain}:${clientId}`;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { shopDomain: domain, token: cached.token };
  }

  const { accessToken, expiresIn } = await exchangeClientCredentials(
    domain,
    clientId,
    decrypt(config.adminClientSecret),
  );

  cache.set(cacheKey, {
    token: accessToken,
    expiresAt: now + expiresIn * 1000 - SKEW_MS,
  });

  return { shopDomain: domain, token: accessToken };
}

/** Drop any cached token for a tenant (call after credentials change). */
export async function clearAdminTokenCache(tenantId: string): Promise<void> {
  const config = await prisma.shopifyConfig.findUnique({
    where: { tenantId },
    select: { shopDomain: true, adminShopDomain: true },
  });
  if (!config) return;
  // Keys are `${domain}:${clientId}` — clear all for either possible domain so a
  // changed/removed Client ID or domain can't leave a stale token behind.
  const prefixes = [config.shopDomain, config.adminShopDomain]
    .filter(Boolean)
    .map((d) => `${d}:`);
  for (const key of cache.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) cache.delete(key);
  }
}
