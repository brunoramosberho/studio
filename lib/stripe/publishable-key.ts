/**
 * Publishable keys are safe to expose to the browser. Resolved server-side so
 * tenants in sandbox mode get `pk_test_*` without a second public env build.
 */
export function resolveStripePublishableKey(sandbox: boolean): string | null {
  if (sandbox) {
    return (
      process.env.STRIPE_PUBLISHABLE_KEY_TEST?.trim() ||
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST?.trim() ||
      null
    );
  }
  return (
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    null
  );
}
