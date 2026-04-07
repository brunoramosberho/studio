/** Converts a decimal amount (e.g. euros) to Stripe's smallest unit (cents). */
export const toStripeAmount = (amount: number): number =>
  Math.round(amount * 100);

/** Converts Stripe cents back to a decimal amount. */
export const fromStripeAmount = (cents: number): number => cents / 100;

/** Calculates application_fee in cents from a euro amount and fee percentage. */
export const calculateFee = (
  amountInCurrency: number,
  feePercent: number,
): number => Math.round(toStripeAmount(amountInCurrency) * (feePercent / 100));
