/**
 * Tenant-aware currency utilities.
 *
 * Currency is anchored to the tenant's `defaultCountry`. The Country row owns
 * the ISO 4217 code, display symbol and Intl locale. Everything else in the
 * app should go through these helpers instead of hardcoding "€" / "EUR".
 *
 * The server-side `getTenantCurrency()` is the source of truth; the client
 * receives the resolved config via `TenantProvider` and consumes it via
 * `useCurrency()`.
 */

export interface CurrencyConfig {
  /** ISO 4217 currency code (always upper-case). */
  code: string;
  /** Display symbol ("€", "$", "£", "MX$"…). */
  symbol: string;
  /** BCP 47 locale used to format numbers ("es-ES", "es-MX", "en-US"…). */
  intlLocale: string;
  /** ISO 3166-1 alpha-2 country code ("ES", "MX", "US"…) or null when unknown. */
  countryCode: string | null;
}

/**
 * Fallback used only when a tenant has no `defaultCountry` yet (fresh install,
 * in-flight onboarding). Matches the legacy behaviour the app shipped with.
 */
export const FALLBACK_CURRENCY: CurrencyConfig = {
  code: "EUR",
  symbol: "€",
  intlLocale: "es-ES",
  countryCode: null,
};

/** Minimal map for currencies that may appear before a Country row exists. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  MXN: "$",
  USD: "$",
  GBP: "£",
  ARS: "$",
  COP: "$",
  CLP: "$",
  PEN: "S/",
  BRL: "R$",
};

/** Resolve a display symbol for an arbitrary ISO 4217 code. */
export function currencySymbolFor(code: string): string {
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? code.toUpperCase();
}

/**
 * Format an amount using the tenant's currency config. If `overrideCode` is
 * provided (e.g. a Package pinned to a different currency) we use that code
 * and try to keep a sensible locale — the caller's locale if it already
 * matches, otherwise a safe default for that currency.
 */
export function formatMoney(
  amount: number,
  config: CurrencyConfig,
  overrideCode?: string | null,
): string {
  const code = (overrideCode ?? config.code).toUpperCase();
  const locale = code === config.code ? config.intlLocale : defaultLocaleForCurrency(code);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Invalid ISO code or locale — fall back to symbol + raw number.
    return `${currencySymbolFor(code)}${Math.round(amount).toLocaleString()}`;
  }
}

/**
 * Server-side resolver that does not depend on the React request cache.
 * Use this from webhooks, crons and background jobs where `getTenantCurrency()`
 * (which relies on `getTenant()` headers) isn't available.
 *
 * Imports prisma lazily to keep this module safe to import from the client.
 */
export async function resolveTenantCurrency(tenantId: string): Promise<CurrencyConfig> {
  const { prisma } = await import("./db");
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      defaultCountry: {
        select: { currency: true, currencySymbol: true, intlLocale: true, code: true },
      },
    },
  });
  const country = tenant?.defaultCountry;
  if (!country) return FALLBACK_CURRENCY;
  return {
    code: country.currency,
    symbol: country.currencySymbol,
    intlLocale: country.intlLocale,
    countryCode: country.code,
  };
}

function defaultLocaleForCurrency(code: string): string {
  switch (code) {
    case "MXN": return "es-MX";
    case "USD": return "en-US";
    case "GBP": return "en-GB";
    case "ARS": return "es-AR";
    case "COP": return "es-CO";
    case "CLP": return "es-CL";
    case "PEN": return "es-PE";
    case "BRL": return "pt-BR";
    case "EUR":
    default:    return "es-ES";
  }
}
