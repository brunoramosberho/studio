import type Stripe from "stripe";
import { getStripeForCountry } from "./client";
import { prisma } from "@/lib/db";
import { FALLBACK_CURRENCY, type CurrencyConfig } from "@/lib/currency";

export type TenantStripeContext = {
  stripe: Stripe;
  currency: string;
  countryCode: string | null;
  sandbox: boolean;
  currencyConfig: CurrencyConfig;
};

/**
 * Single DB round-trip: tenant country + sandbox flag + matching Stripe SDK instance.
 */
export async function getTenantStripeContext(
  tenantId: string,
): Promise<TenantStripeContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      stripeSandboxMode: true,
      defaultCountry: {
        select: {
          currency: true,
          currencySymbol: true,
          intlLocale: true,
          code: true,
        },
      },
    },
  });

  const country = tenant?.defaultCountry;
  const cfg: CurrencyConfig = country
    ? {
        code: country.currency,
        symbol: country.currencySymbol,
        intlLocale: country.intlLocale,
        countryCode: country.code,
      }
    : FALLBACK_CURRENCY;

  const sandbox = tenant?.stripeSandboxMode ?? false;

  return {
    stripe: getStripeForCountry(cfg.countryCode, { sandbox }),
    currency: cfg.code.toLowerCase(),
    countryCode: cfg.countryCode,
    sandbox,
    currencyConfig: cfg,
  };
}

export async function getStripeClientForTenantId(
  tenantId: string,
): Promise<Stripe> {
  const { stripe } = await getTenantStripeContext(tenantId);
  return stripe;
}
