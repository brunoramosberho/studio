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

/**
 * Extract the active billing period from a Stripe Subscription object.
 *
 * Stripe moved `current_period_start` / `current_period_end` from the root
 * Subscription object onto each Subscription Item in API version 2024-09-30.
 * We support both shapes — first checking the root for older API versions /
 * older webhook payloads, then falling back to the first item's fields, which
 * is correct for any subscription with one price (the only case we use today).
 *
 * Returns Unix epoch seconds (Stripe's native unit). Callers convert to Date
 * with `new Date(seconds * 1000)`.
 */
export function getSubscriptionPeriod(
  subscription: unknown,
): { start: number; end: number } | null {
  if (!subscription || typeof subscription !== "object") return null;
  const obj = subscription as Record<string, unknown>;

  const rootStart = obj.current_period_start;
  const rootEnd = obj.current_period_end;
  if (typeof rootStart === "number" && typeof rootEnd === "number") {
    return { start: rootStart, end: rootEnd };
  }

  const items = obj.items as { data?: Array<Record<string, unknown>> } | undefined;
  const item = items?.data?.[0];
  if (item) {
    const itemStart = item.current_period_start;
    const itemEnd = item.current_period_end;
    if (typeof itemStart === "number" && typeof itemEnd === "number") {
      return { start: itemStart, end: itemEnd };
    }
  }

  return null;
}

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
