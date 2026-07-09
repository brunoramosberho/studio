// Shared POS discount math so the amount shown in the cart and the amount
// actually charged/recorded by the sale route never drift.

export type PosDiscount = {
  /** "percent" → value is 0–100; "amount" → value is a currency amount off the total. */
  type: "percent" | "amount";
  value: number;
};

/** Discount amount in currency units (>= 0), clamped to the subtotal. */
export function posDiscountAmount(
  subtotal: number,
  discount: PosDiscount | null | undefined,
): number {
  if (!discount || subtotal <= 0) return 0;
  const raw =
    discount.type === "percent"
      ? (subtotal * Math.min(Math.max(discount.value, 0), 100)) / 100
      : Math.max(discount.value, 0);
  return Math.min(Math.round(raw * 100) / 100, subtotal);
}

/** Net total after the discount (>= 0). */
export function posNetTotal(
  subtotal: number,
  discount: PosDiscount | null | undefined,
): number {
  return Math.round((subtotal - posDiscountAmount(subtotal, discount)) * 100) / 100;
}

/**
 * Spread a whole-sale discount across line gross amounts, returning the net
 * amount charged per line. The sum of the returned lines equals the net total
 * exactly (any rounding remainder lands on the last line) — so the per-line
 * PosTransactions reconcile to what was actually charged.
 */
export function distributeDiscount(
  lineGross: number[],
  discount: PosDiscount | null | undefined,
): number[] {
  const gross = lineGross.reduce((s, v) => s + v, 0);
  const net = posNetTotal(gross, discount);
  if (gross <= 0) return lineGross.map(() => 0);
  const factor = net / gross;
  const out: number[] = [];
  let allocated = 0;
  for (let i = 0; i < lineGross.length; i++) {
    if (i === lineGross.length - 1) {
      out.push(Math.round((net - allocated) * 100) / 100);
    } else {
      const v = Math.round(lineGross[i] * factor * 100) / 100;
      out.push(v);
      allocated += v;
    }
  }
  return out;
}
