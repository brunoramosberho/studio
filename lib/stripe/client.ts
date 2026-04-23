import Stripe from "stripe";

/**
 * Magic operates one platform Stripe account per legal entity / billing country
 * so that:
 *   • invoices issued to studios are tax-compliant in the local jurisdiction
 *     (CFDI in MX, IVA-NIF in ES, US sales tax handling…),
 *   • payouts land in a local bank account without FX fees,
 *   • Stripe Connect onboarding can offer local payment methods (OXXO, SEPA…).
 *
 * Today only the ES entity is live (`STRIPE_SECRET_KEY_ES`). The legacy
 * `STRIPE_SECRET_KEY` env var is treated as the default and is the same key
 * that signed off all currently-connected accounts, so we keep it as the
 * fallback for any country we haven't explicitly wired up yet.
 *
 * To add a new entity later: set `STRIPE_SECRET_KEY_<COUNTRY_CODE>` (e.g.
 * `STRIPE_SECRET_KEY_MX`) — no code change is required, the resolver picks it
 * up automatically.
 */

const _instances = new Map<string, Stripe>();

function envKeyFor(countryCode: string | null | undefined): string | undefined {
  if (countryCode) {
    const fromCountry = process.env[`STRIPE_SECRET_KEY_${countryCode.toUpperCase()}`];
    if (fromCountry) return fromCountry;
  }
  return process.env.STRIPE_SECRET_KEY;
}

/**
 * Default platform Stripe instance. Use this for non-tenant-bound calls (e.g.
 * webhook signature verification where the platform signs across all
 * accounts). For tenant-bound calls, prefer `getStripeForCountry`.
 */
export function getStripe(): Stripe {
  return getStripeForCountry(null);
}

/**
 * Resolve the right platform Stripe instance for a tenant's billing country.
 * Falls back to the default key when no country-specific key exists.
 */
export function getStripeForCountry(countryCode: string | null | undefined): Stripe {
  const cacheKey = countryCode?.toUpperCase() ?? "_default";
  const cached = _instances.get(cacheKey);
  if (cached) return cached;

  const secret = envKeyFor(countryCode);
  if (!secret) {
    throw new Error(
      countryCode
        ? `STRIPE_SECRET_KEY_${countryCode.toUpperCase()} (and STRIPE_SECRET_KEY fallback) not set`
        : "STRIPE_SECRET_KEY is not set",
    );
  }
  const instance = new Stripe(secret);
  _instances.set(cacheKey, instance);
  return instance;
}
