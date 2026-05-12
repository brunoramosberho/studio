import Stripe from "stripe";

/**
 * Magic operates one platform Stripe account per legal entity / billing country
 * so that:
 *   • invoices issued to studios are tax-compliant in the local jurisdiction
 *     (CFDI in MX, IVA-NIF in ES, US sales tax handling…),
 *   • payouts land in a local bank account without FX fees,
 *   • Stripe Connect onboarding can offer local payment methods (OXXO, SEPA…).
 *
 * **Live keys:** `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_<CC>` (e.g. ES, MX).
 *
 * **Test keys (per-tenant `stripeSandboxMode`):**
 * `STRIPE_SECRET_KEY_TEST`, `STRIPE_SECRET_KEY_<CC>_TEST` — same fallback chain as live.
 */

const _instances = new Map<string, Stripe>();

function envKeyFor(
  countryCode: string | null | undefined,
  sandbox: boolean,
): string | undefined {
  if (sandbox) {
    if (countryCode) {
      const fromCountry =
        process.env[`STRIPE_SECRET_KEY_${countryCode.toUpperCase()}_TEST`];
      if (fromCountry?.trim()) return fromCountry.trim();
    }
    const test = process.env.STRIPE_SECRET_KEY_TEST?.trim();
    if (test) return test;
    return undefined;
  }

  if (countryCode) {
    const fromCountry =
      process.env[`STRIPE_SECRET_KEY_${countryCode.toUpperCase()}`]?.trim();
    if (fromCountry) return fromCountry;
  }
  return process.env.STRIPE_SECRET_KEY?.trim();
}

function cacheKey(
  countryCode: string | null | undefined,
  sandbox: boolean,
): string {
  return `${countryCode?.toUpperCase() ?? "_default"}_${sandbox ? "test" : "live"}`;
}

export type StripeCountryOptions = {
  /** Use Stripe test-mode secret keys for this tenant. */
  sandbox?: boolean;
};

/**
 * Default platform Stripe instance (**live**). Use for calls that are not
 * tied to a tenant (e.g. webhook verification attempts with the primary secret).
 */
export function getStripe(): Stripe {
  return getStripeForCountry(null, { sandbox: false });
}

/**
 * Resolve the platform Stripe instance for a billing country and mode.
 */
export function getStripeForCountry(
  countryCode: string | null | undefined,
  options?: StripeCountryOptions,
): Stripe {
  const sandbox = options?.sandbox ?? false;
  const key = cacheKey(countryCode, sandbox);
  const cached = _instances.get(key);
  if (cached) return cached;

  const secret = envKeyFor(countryCode, sandbox);
  if (!secret) {
    if (sandbox) {
      throw new Error(
        countryCode
          ? `Stripe sandbox: set STRIPE_SECRET_KEY_${countryCode.toUpperCase()}_TEST or STRIPE_SECRET_KEY_TEST`
          : "Stripe sandbox: set STRIPE_SECRET_KEY_TEST",
      );
    }
    throw new Error(
      countryCode
        ? `STRIPE_SECRET_KEY_${countryCode.toUpperCase()} (and STRIPE_SECRET_KEY fallback) not set`
        : "STRIPE_SECRET_KEY is not set",
    );
  }
  const instance = new Stripe(secret);
  _instances.set(key, instance);
  return instance;
}
