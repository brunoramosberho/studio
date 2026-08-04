import Stripe from "stripe";

/**
 * Stripe error shapes we react to rather than propagate.
 *
 * Kept free of database imports so the matchers can be unit tested — they are
 * regexes over Stripe's prose, which is exactly the kind of thing that breaks
 * silently when the wording changes.
 */

/**
 * Stripe refuses application fees for some platform/connected-account country
 * pairs:
 *
 *   "Stripe doesn't currently support application fees for platforms in ES
 *    with connected accounts in MX."
 *
 * Which pairs are allowed is Stripe's business and moves over time, so this
 * matches the refusal instead of trying to keep a country matrix in sync.
 */
export function isApplicationFeeUnsupportedError(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    /application fees? for platforms/i.test(err.message)
  );
}

/** The stored customer no longer exists on the connected account. */
export function isMissingCustomerError(err: unknown): boolean {
  return (
    err instanceof Stripe.errors.StripeInvalidRequestError &&
    err.code === "resource_missing" &&
    (err.param === "customer" || /no such customer/i.test(err.message))
  );
}
