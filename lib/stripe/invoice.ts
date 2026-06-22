/**
 * Extract the subscription id from a Stripe Invoice across API versions.
 *
 * The legacy top-level `invoice.subscription` field was removed in Stripe's
 * Basil API (2025-03-31) and every version after it (including the
 * `2026-03-25.dahlia` version our Connect webhook receives). The reference
 * moved onto `invoice.parent.subscription_details.subscription` (and a
 * line-level `parent.subscription_item_details.subscription`).
 *
 * Reading only `invoice.subscription` made every subscription `invoice.paid`
 * silently no-op: the webhook handler couldn't resolve the MemberSubscription,
 * broke early, and never created the UserPackage / StripePayment — so paid
 * memberships showed "no credits". This reads all known shapes so it works
 * regardless of the account's API version.
 */
export function getInvoiceSubscriptionId(
  inv: Record<string, unknown>,
): string | null {
  const asId = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") {
      return (v as { id: string }).id;
    }
    return null;
  };

  // Legacy (pre-Basil): top-level `subscription` (string or expanded object).
  const legacy = asId(inv.subscription);
  if (legacy) return legacy;

  // Basil+ (2025-03-31 / dahlia): invoice.parent.subscription_details.subscription
  const parent = inv.parent as
    | { subscription_details?: { subscription?: unknown } }
    | null
    | undefined;
  const fromParent = asId(parent?.subscription_details?.subscription);
  if (fromParent) return fromParent;

  // Line-level fallback: lines.data[].parent.subscription_item_details.subscription
  const lines = inv.lines as
    | { data?: Array<{ parent?: { subscription_item_details?: { subscription?: unknown } } }> }
    | undefined;
  for (const line of lines?.data ?? []) {
    const fromLine = asId(line?.parent?.subscription_item_details?.subscription);
    if (fromLine) return fromLine;
  }

  return null;
}
