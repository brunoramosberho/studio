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

/** Adds N business days to a date, skipping Saturdays and Sundays. */
export function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}
