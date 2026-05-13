import { prisma } from "@/lib/db";
import { resolveTenantCurrency } from "@/lib/currency";
import { getSaasPlanEnvFallback } from "./products";

/** Default catalog row when no country-specific `SaasPlan` exists. */
export const SAAS_PLAN_GLOBAL_COUNTRY = "__";

export type SaasPriceSource =
  | "tenant_override"
  | "catalog_country"
  | "catalog_global"
  | "env_fallback";

export type ResolvedSaasStripePrice = {
  stripePriceId: string;
  source: SaasPriceSource;
};

export type SaasPlanPublic = {
  planKey: string;
  name: string;
  currency: string;
  amountCents: number | null;
  countryCode: string;
  /** True when served from env fallback (no DB row). */
  fromEnvFallback: boolean;
};

type SaasPlanRow = {
  planKey: string;
  countryCode: string;
  stripePriceId: string;
  stripePriceIdSandbox: string | null;
  currency: string;
  amountCents: number | null;
  name: string | null;
  sortOrder: number;
};

function effectiveSaasPriceId(row: SaasPlanRow, sandbox: boolean): string | null {
  if (sandbox) {
    const t = row.stripePriceIdSandbox?.trim();
    if (t) return t;
  }
  const live = row.stripePriceId.trim();
  return live || null;
}

/**
 * Stripe Price ID for the tenant's SaaS subscription.
 * Precedence: `Tenant.saasStripePriceIdOverride` → country `SaasPlan` → global → env vars.
 * In sandbox, uses `stripePriceIdSandbox` on catalog rows when set.
 */
export async function resolveSaasStripePriceId(
  tenantId: string,
  planKey: string,
): Promise<ResolvedSaasStripePrice | null> {
  const normalizedKey = planKey.trim().toLowerCase();
  if (!normalizedKey) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { saasStripePriceIdOverride: true, stripeSandboxMode: true },
  });
  const sandbox = tenant?.stripeSandboxMode ?? false;
  const override = tenant?.saasStripePriceIdOverride?.trim();
  if (override) {
    return { stripePriceId: override, source: "tenant_override" };
  }

  const { countryCode } = await resolveTenantCurrency(tenantId);
  const cc = (countryCode ?? SAAS_PLAN_GLOBAL_COUNTRY).toUpperCase();

  const countryRow = await prisma.saasPlan.findFirst({
    where: {
      planKey: normalizedKey,
      countryCode: cc,
      isActive: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  const countryPrice = countryRow
    ? effectiveSaasPriceId(countryRow as SaasPlanRow, sandbox)
    : null;
  if (countryPrice) {
    return {
      stripePriceId: countryPrice,
      source: "catalog_country",
    };
  }

  const globalRow = await prisma.saasPlan.findFirst({
    where: {
      planKey: normalizedKey,
      countryCode: SAAS_PLAN_GLOBAL_COUNTRY,
      isActive: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  const globalPrice = globalRow
    ? effectiveSaasPriceId(globalRow as SaasPlanRow, sandbox)
    : null;
  if (globalPrice) {
    return {
      stripePriceId: globalPrice,
      source: "catalog_global",
    };
  }

  const fallback = getSaasPlanEnvFallback(normalizedKey, sandbox);
  if (fallback?.priceId) {
    return { stripePriceId: fallback.priceId, source: "env_fallback" };
  }

  return null;
}

/**
 * Plans visible for admin UI: active rows for this tenant's country + global,
 * one row per `planKey` (country beats global). Missing keys can be filled from env fallback.
 */
export async function listSaasPlansForTenant(
  tenantId: string,
): Promise<SaasPlanPublic[]> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeSandboxMode: true },
  });
  const sandbox = tenant?.stripeSandboxMode ?? false;

  const { countryCode } = await resolveTenantCurrency(tenantId);
  const cc = (countryCode ?? SAAS_PLAN_GLOBAL_COUNTRY).toUpperCase();

  const rows = await prisma.saasPlan.findMany({
    where: {
      isActive: true,
      OR: [{ countryCode: cc }, { countryCode: SAAS_PLAN_GLOBAL_COUNTRY }],
    },
    orderBy: [{ sortOrder: "asc" }, { planKey: "asc" }],
  });

  const usable = rows.filter(
    (r) => effectiveSaasPriceId(r as SaasPlanRow, sandbox) != null,
  );

  const merged = new Map<string, (typeof usable)[number]>();
  for (const r of usable) {
    const cur = merged.get(r.planKey);
    if (!cur) {
      merged.set(r.planKey, r);
      continue;
    }
    const replace =
      cur.countryCode === SAAS_PLAN_GLOBAL_COUNTRY && r.countryCode === cc;
    if (replace) merged.set(r.planKey, r);
  }

  const dbSorted = [...merged.values()].sort((a, b) =>
    a.sortOrder !== b.sortOrder
      ? a.sortOrder - b.sortOrder
      : a.planKey.localeCompare(b.planKey),
  );

  const stripped: SaasPlanPublic[] = dbSorted.map((r) => ({
    planKey: r.planKey,
    name: r.name ?? r.planKey,
    currency: r.currency,
    amountCents: r.amountCents ?? null,
    countryCode: r.countryCode,
    fromEnvFallback: false,
  }));

  const keysFromDb = new Set(stripped.map((p) => p.planKey));
  const envKeys = ["starter", "growth", "scale"] as const;
  for (const k of envKeys) {
    if (keysFromDb.has(k)) continue;
    const fb = getSaasPlanEnvFallback(k, sandbox);
    if (!fb?.priceId) continue;
    stripped.push({
      planKey: k,
      name: fb.name,
      currency: "eur",
      amountCents: fb.amountCents,
      countryCode: SAAS_PLAN_GLOBAL_COUNTRY,
      fromEnvFallback: true,
    });
  }

  return stripped;
}
